# Glossary

## core

- **ExampleTerm** — Definition of example domain term. Aliases: alias1, alias2.

## ui-component-library

- **樣式規格** — `ui` package 的 `theme.css` 所定義的一組語意 design tokens 與預設值，是色彩與樣式的唯一來源；application 只能覆寫或擴充，不能繞過。 Aliases: Style Specification、theme。
- **語意 token** — 以用途命名的 design token（如 accent、danger、border），同時是 CSS custom property 與 utility class；本 change 不定義原始色階。 Aliases: Semantic Token。
- **Domain token** — 由 application 擴充、以 domain 概念命名的 token（如 `type-string`），不得出現在 `ui` package。 Aliases: 擴充 token。
- **Ui 元件** — 由 `@low-code-flow/ui` 統一匯出、以 `Ui` 前綴命名、公開 API 不含 domain 型別的元件。 Aliases: UI primitive。
