# Third-party notices

QuotaDeck includes modified MIT-licensed code from the following projects. Full notices are in `licenses/` and are included in distribution documentation.

- **ckken/sub2api-mobile** — Copyright (c) 2026 ckken. `mobile/src/vendor/sub2api-mobile/request-url.ts` adapted from `src/lib/admin-fetch.ts`. Imports and application state coupling were removed. See `licenses/sub2api-mobile.txt`.
- **CrossStar/sub2api-dashboard** — Copyright (c) 2026 CrossStar. `mobile/src/vendor/sub2api-dashboard/` contains its quota mapper, account normalizer, error definitions, and a native-only type subset. Imports were adjusted for a mobile bundle. See `licenses/sub2api-dashboard.txt`.
- **MuAllen/dsh-gateway-wallet** — Copyright (c) 2026 MuAllen. `mobile/src/vendor/dsh-gateway-wallet/fingerprint.ts` contains its relay fingerprinting logic. See `licenses/dsh-gateway-wallet.txt`.

Other referenced projects are documented in `docs/REFERENCE_REVIEW.md`; their code is not included. Expo, React, React Native and other installed packages retain their own licenses.
