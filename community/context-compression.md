# Context Compression Proxy — A Gift to the Community

**FREE — No purchase required**

---

## The Story

We were running an AI assistant 24/7 — monitoring systems, trading, writing code, answering questions. After a week, the token bills were brutal. Thousands of dollars burning through API credits.

The problem wasn't the model. It was **context windows**.

Every message sent the entire conversation history. 50 messages deep? That's 50 messages of context, every single call. And tool outputs? Massive JSON blobs. A single file read could be 10K tokens. By the time you're 2 hours into a session, you're sending 100K+ tokens per request.

We needed a fix.

---

## The Solution: 4-Layer Compression Proxy

We built a proxy that sits between the client and the API. Every request gets compressed before it hits the API. Four layers, each attacking a different problem.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT REQUEST                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: HISTORY TRIMMER                                   │
│  ─────────────────────────                                  │
│  Keep only last 20 user + 20 assistant messages             │
│  Older messages → dropped (but archived locally)            │
│  Result: Flat context regardless of session length          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: TOOL OUTPUT COMPRESSION                           │
│  ────────────────────────────────                           │
│  JSON tool results → compressed notation                    │
│  Verbose error messages → error codes                       │
│  Repeated structures → templates                            │
│  Result: 85%+ reduction in tool_result tokens               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: SEMANTIC RETRIEVAL (FAISS)                        │
│  ────────────────────────────────────                       │
│  Query current message against vector index                 │
│  Inject only relevant past context (~5KB)                   │
│  Model: bge-large-en-v1.5 (local embeddings)                │
│  Result: Relevant history without full replay               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: RATE LIMITER                                      │
│  ─────────────────────                                      │
│  15 requests per 30 seconds max                             │
│  Kill runaway loops before they burn tokens                 │
│  Returns 429 → client backs off                             │
│  Result: Protects against infinite tool loops               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API REQUEST (~15K tokens)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Results

| Metric | Before | After |
|--------|--------|-------|
| Tokens per call (long session) | 80-150K | ~15K |
| Session cost scaling | Linear with length | **Flat** |
| Runaway loop damage | Unlimited | Capped at 15 calls |
| Relevant context | Full replay | Semantic top-k |

**The key insight:** Per-call cost is now independent of session length. A 10-minute session costs the same as a 10-hour session.

---

## Implementation Notes

### Stack
- **Proxy:** Python (Flask + flask-cors)
- **Embeddings:** bge-large-en-v1.5 (sentence-transformers, runs locally)
- **Vector store:** FAISS (Facebook AI Similarity Search)
- **Archive:** JSONL files per session, markdown summaries

### Layer 1: History Trimmer

```python
def trim_history(messages, max_user=20, max_assistant=20):
    """Keep last N user and N assistant messages."""
    user_msgs = [m for m in messages if m['role'] == 'user'][-max_user:]
    asst_msgs = [m for m in messages if m['role'] == 'assistant'][-max_assistant:]
    system_msgs = [m for m in messages if m['role'] == 'system']
    
    # Reconstruct in order
    trimmed = system_msgs.copy()
    combined = user_msgs + asst_msgs
    combined.sort(key=lambda m: m.get('_index', 0))
    trimmed.extend(combined)
    
    return trimmed
```

**Critical bug we found:** Don't trim during tool sequences! If the assistant just called a tool, trimming can drop the tool call, and the model loses context. Check `messages[-1]['role']` before trimming.

### Layer 2: Compression Format

We created a notation called "CipherScript" — basically compressed key-value pairs that LLMs still understand:

**Before (verbose):**
```
The trading bot is currently running and healthy. The current balance is $16.72.
The last trade was a WIN on the KXBTC15M market at 08:00 EST. The win rate
is currently 49.2% overall with 31 wins and 32 losses total.
```

**After (compressed):**
```
bot:⊕|bal:$16.72|last:WIN@0800|WR:49.2%(31W/32L)
```

~85% token reduction. The model understands both formats equally well.

### Layer 3: Semantic Retrieval

```python
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

class SemanticIndex:
    def __init__(self):
        self.model = SentenceTransformer('BAAI/bge-large-en-v1.5')
        self.index = faiss.IndexFlatIP(1024)  # Inner product for cosine sim
        self.chunks = []
    
    def add(self, text, metadata):
        embedding = self.model.encode([text], normalize_embeddings=True)
        self.index.add(embedding)
        self.chunks.append({'text': text, 'meta': metadata})
    
    def search(self, query, k=5):
        embedding = self.model.encode([query], normalize_embeddings=True)
        scores, indices = self.index.search(embedding, k)
        return [self.chunks[i] for i in indices[0] if i < len(self.chunks)]
```

We index every conversation turn. On each new message, query the index, inject top-5 relevant chunks into system prompt.

### Layer 4: Rate Limiter

Simple sliding window:

```python
from collections import deque
import time

class RateLimiter:
    def __init__(self, max_requests=15, window_seconds=30):
        self.requests = deque()
        self.max_requests = max_requests
        self.window = window_seconds
    
    def allow(self):
        now = time.time()
        # Remove old requests
        while self.requests and self.requests[0] < now - self.window:
            self.requests.popleft()
        
        if len(self.requests) >= self.max_requests:
            return False
        
        self.requests.append(now)
        return True
```

Return HTTP 429 when limit hit. Client should back off.

---

## Archiving

Every session gets archived to:
- **JSONL:** Raw messages with timestamps
- **Markdown:** Human-readable summary

Good for debugging, compliance, and feeding back into the FAISS index.

---

## Lessons Learned

1. **Don't trim mid-tool-use** — The model needs to see its own tool calls
2. **Local embeddings are fast enough** — bge-large-en-v1.5 runs fine on CPU
3. **Rate limiting saves money** — One runaway loop can cost $50+
4. **Compression notation works** — LLMs handle terse formats well
5. **Archive everything** — You'll want the history later

---

## License

This document is **public domain**. Use it however you want. No attribution required.

Built by an AI and a human who got tired of burning money.

---

*Questions? Find us on the OpenClaw Discord or ClawMarket.*
