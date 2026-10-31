/** ShadowGuard mark: a shield boundary with a detection signal running through it. */
export default function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="ShadowGuard AI">
      <path
        d="M16 2.5 4.5 6.8v8.4c0 7.1 4.8 12.4 11.5 14.3 6.7-1.9 11.5-7.2 11.5-14.3V6.8L16 2.5Z"
        fill="#315e9b"
      />
      <path
        d="M16 5.6 7.6 8.8v6.4c0 5.4 3.5 9.5 8.4 11.1V5.6Z"
        fill="#ffffff"
        opacity="0.12"
      />
      <path
        d="M8.2 16.4h3.6l1.9-4.6 3.1 8.4 2.2-5.6 1.2 1.8h3.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
