"use client";

// 반 개 단위 별점 (0.5 ~ 5.0) — 레포브 관찰(WEB-4) 반영: 별 왼쪽 절반 탭 = 0.5, 오른쪽 = 1.0

export default function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const current = value ?? 0;
  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className="relative inline-block text-2xl leading-none">
          <span className="text-gray-300">★</span>
          <span
            className="absolute inset-0 overflow-hidden text-amber-400"
            style={{
              width:
                current >= star ? "100%" : current >= star - 0.5 ? "50%" : "0%",
            }}
          >
            ★
          </span>
          <button
            type="button"
            aria-label={`${star - 0.5}점`}
            data-testid={`star-${star - 0.5}`}
            onClick={() => onChange(star - 0.5)}
            className="absolute inset-y-0 left-0 w-1/2"
          />
          <button
            type="button"
            aria-label={`${star}점`}
            data-testid={`star-${star}`}
            onClick={() => onChange(star)}
            className="absolute inset-y-0 right-0 w-1/2"
          />
        </span>
      ))}
      {value != null ? (
        <>
          <span className="ml-2 text-sm tabular-nums text-gray-600">
            {value.toFixed(1)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-1 text-xs text-gray-400 hover:text-gray-600"
          >
            지우기
          </button>
        </>
      ) : (
        <span className="ml-2 text-xs text-gray-400">별점 없음</span>
      )}
    </div>
  );
}
