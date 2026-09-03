# Third-party notices

This file records third-party software notices that apply to the standalone desktop product.

## `@openai/codex` runtime

If a release genuinely bundles the `@openai/codex` runtime, that component is distributed under the Apache License 2.0. The product does not change that license or imply that the runtime is part of the product's MIT-licensed source. The applicable notice and license text must remain available with every packaged distribution that actually includes the runtime.

- Upstream project: [openai/codex](https://github.com/openai/codex)
- License: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Package: `@openai/codex`
- Distribution status: the runtime bundle and its exact version are not verified in this product-record baseline. Packaging evidence must identify the version, source revision, package hash, and included notice before a release is published. If the runtime is not packaged, this conditional notice remains attribution guidance only.

## Notice maintenance

When a third-party component is added, upgraded, or removed, update this file in the same change as the dependency manifest and packaging record. Do not copy generated dependency directories into source control. A release is not ready until the shipped notice set matches the packaged contents.
