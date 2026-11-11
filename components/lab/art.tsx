"use client";
import { useId } from "react";

export function ProductArt({
  type = "brush",
  className = "",
}: {
  type?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "_");
  const lamp = /đèn|lamp|light/i.test(type),
    brush = /lược|brush|tóc|hair/i.test(type);
  return (
    <div
      className={`product-art ${lamp ? "art-peach" : brush ? "art-lilac" : "art-neutral"} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 240 180" fill="none">
        <defs>
          <linearGradient
            id={`${id}-body`}
            x1="90"
            y1="20"
            x2="153"
            y2="143"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#f8f5ff" />
            <stop offset=".35" stopColor="#d9cde9" />
            <stop offset=".75" stopColor="#bba9d1" />
            <stop offset="1" stopColor="#9e8bbb" />
          </linearGradient>
          <linearGradient
            id={`${id}-handle`}
            x1="107"
            y1="104"
            x2="136"
            y2="158"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#cfbedf" />
            <stop offset="1" stopColor="#ac95c7" />
          </linearGradient>
          <linearGradient
            id={`${id}-lamp`}
            x1="132"
            y1="20"
            x2="184"
            y2="59"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fff9f0" />
            <stop offset=".5" stopColor="#e8d7bc" />
            <stop offset="1" stopColor="#c5aa86" />
          </linearGradient>
        </defs>
        <ellipse
          cx="122"
          cy="160"
          rx="54"
          ry="7"
          fill="currentColor"
          opacity=".12"
        />
        {lamp ? (
          <g>
            <path
              d="M118 63v85"
              stroke="#c3ab8d"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M116 64v75"
              stroke="#f2e4d0"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M119 77l40-33"
              stroke="#d7c3a6"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M140 26c16-13 44-1 43 17l-18 18-33-28 8-7Z"
              fill={`url(#${id}-lamp)`}
            />
            <path d="m133 33 32 28" stroke="#b69a74" strokeWidth="3" />
            <path
              d="m139 28 21-1"
              stroke="#fffdf7"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <ellipse cx="118" cy="149" rx="35" ry="10" fill="#c4a883" />
            <ellipse cx="118" cy="145" rx="35" ry="9" fill="#e8d8c1" />
            <path
              d="M91 145c10-5 31-7 52 0"
              stroke="#fbf4e8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="m158 61 30 55H99l36-67" fill="#fff8dd" opacity=".45" />
          </g>
        ) : brush ? (
          <g transform="rotate(22 120 90)">
            <rect
              x="106"
              y="88"
              width="28"
              height="75"
              rx="13"
              fill={`url(#${id}-handle)`}
            />
            <path
              d="M111 112v34"
              stroke="#eadff5"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <rect
              x="81"
              y="17"
              width="78"
              height="95"
              rx="35"
              fill={`url(#${id}-body)`}
            />
            <rect
              x="90"
              y="24"
              width="60"
              height="79"
              rx="29"
              fill="#ac96c6"
              stroke="#e4d8ef"
              strokeWidth="1"
            />
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i}>
                <path
                  d={`M99 ${36 + i * 9}h42`}
                  stroke="#e9e1f2"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <circle cx="100" cy={36 + i * 9} r="2" fill="#fff" />
                <circle cx="140" cy={36 + i * 9} r="2" fill="#f8f4fe" />
              </g>
            ))}
            <path
              d="M96 28c-10 12-12 36-8 53"
              stroke="#faf7ff"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M152 45v25"
              stroke="#9c83b7"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <circle cx="120" cy="148" r="3" fill="#9c80b8" />
            <circle cx="120" cy="148" r="1.5" fill="#e8dbf4" />
          </g>
        ) : (
          <g>
            <path
              d="m67 65 53-28 54 28-54 29-53-29Z"
              fill="#f5f7fb"
              stroke="#bec9d9"
            />
            <path
              d="m67 65 53 29v61l-53-29V65Z"
              fill="#d7deeb"
              stroke="#bec9d9"
            />
            <path
              d="m120 94 54-29v61l-54 29V94Z"
              fill="#bdcadd"
              stroke="#aebed3"
            />
            <path d="m91 52 55 29v24l-12 7V88L80 59l11-7Z" fill="#dcd4ed" />
            <path
              d="m77 101 19 10m-19-3 13 7"
              stroke="#a5b3c8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
      <span className="art-orbit orbit-one" />
      <span className="art-orbit orbit-two" />
    </div>
  );
}
