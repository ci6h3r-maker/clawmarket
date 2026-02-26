"use client";

export function StarRating({
  rating,
  size = 14,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.floor(rating);
        const partial = !filled && star === Math.ceil(rating);
        const fillPercent = partial ? (rating % 1) * 100 : 0;
        const gradId = `sg-${star}-${rating.toFixed(1)}`;

        return (
          <svg
            key={star}
            width={size}
            height={size}
            viewBox="0 0 20 20"
            className="shrink-0"
          >
            {partial && (
              <defs>
                <linearGradient id={gradId}>
                  <stop offset={`${fillPercent}%`} stopColor="#f5a623" />
                  <stop offset={`${fillPercent}%`} stopColor="#333" />
                </linearGradient>
              </defs>
            )}
            <path
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              fill={
                filled
                  ? "#f5a623"
                  : partial
                    ? `url(#${gradId})`
                    : "#333"
              }
            />
          </svg>
        );
      })}
    </span>
  );
}
