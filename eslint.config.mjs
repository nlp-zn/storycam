import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".temp/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  ...nextVitals
];

export default eslintConfig;
