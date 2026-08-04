import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Next 16 / React Compiler rules flag normal mount data-fetch patterns.
      // Keep them off until we migrate those panels to a shared data layer.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([
    "node_modules/**",
    ".next/**",
    ".netlify/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tailwind.config.js",
  ]),
]);

export default eslintConfig;
