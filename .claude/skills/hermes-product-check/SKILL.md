---
name: hermes-product-check
description: Check a dropshipping product candidate for Hermes Clip (US market, AI-video Reels) — single listing vs showroom, landed cost ≤ $20, MOQ, shipping, US retail price and markup, patent/brand risk, competition, video fit — and output a row matching Hermes candidate fields. Use whenever the user names a product idea or supplier link and asks if it can sell, is worth testing, fits the budget, or wants Muse research candidates verified.
---
# Hermes product check

Target: cost + shipping to the US ≤ 20 USD, selling price 3–4× that (a hypothesis, not a fact). Free tools only. The point is to stop money and video work going into products that cannot make margin or cannot be sourced as shown, so a clear "no" is a good result.

## Steps

1. **Listing.** Open the supplier link (web fetch, or Agent Reach `read` on the user's machine). Decide `listingStatus`:
   - `single`: one product page;
   - `showroom`: a category/catalogue page with many products (common for Muse research). Prices there are not this product's prices.
   - `not_found`: no supplier page opened yet (name-only requests);
   - `blocked`: captcha, login, 403/429.
   
   Only for `single`, record title, price tiers and currency exactly as shown (CNY/USD, no conversion), MOQ, US shipping, ship-from and lead time. In every other case cost and shipping stay null.

2. **US retail check.** Look up what the generic version sells for in the US (Walmart, Amazon, Chewy or similar; 2–3 prices with links). Realistic selling price ÷ 3 to ÷ 4 = the most you can pay for cost + shipping. If that is far below the user's 20 USD ceiling, say so plainly; it often decides the verdict before any supplier replies.

3. **Exact vs similar.** Do the images/specs you have match the SKU that will appear in the video? `matchType`: `exact_sku` | `similar` | `unknown`.

4. **Landed cost.** Only when cost and shipping share a currency; otherwise "khác tiền tệ". Flag anything over 20 USD.

5. **Risk flags** (`logisticsFlags`):
   - `battery` (lithium: slower, pricier air freight);
   - `liquid`, `fragile`, `bulky` (volumetric shipping);
   - `sizeFit` (sizes mean returns);
   - `vehicleFit` (fits only some cars or bikes);
   - `brandRisk` (brand names or logos on product or box);
   - `ipRisk` (a branded original is patented or design-protected and a copy would look the same; search "<product> patent" or check the leading brand's page).

6. **Video fit.** Is there a one-frame visual payoff? Which Hermes formula fits (problem-vs-result-cta, pov-share-bait, do-not-show, think-vs-actually, audience-callout, emotional-story-pov)? Which details AI video tends to get wrong (text/logos, small parts, transparent materials, moving mechanisms)?

7. **Competition.**
   - Web search cannot count YouTube Shorts or US Ad Library ads; don't keep searching for numbers that won't come. Record `null`.
   - Give the manual checks instead:
     - facebook.com/ads/library, country United States, keyword;
     - YouTube search with the Shorts filter;
     - or Agent Reach `youtube search` on the user's machine.
   - Note who already sells it in US retail (step 2), as saturation evidence.

8. **Verdict.** `try` / `hold` / `reject` with the reason, plus the supplier questions:
   - listing for this exact item;
   - price at MOQ (per size if sized);
   - US shipping cost and time by box size;
   - sample availability;
   - real photos/video;
   - for `ipRisk`, how the design differs from the original.

## Output

One JSON object with Hermes candidate fields:

`name, supplierUrl, supplierCountry, listingStatus, cost, costCurrency, shipping, shippingCurrency, price, currency, minimumOrder, matchType, usRetail {low, high, currency, sources[]}, maxLandedForMarkup, visualPayoff, aiFidelityRisks, logisticsFlags, competition {activeAdsObserved, similarReels30d, observedAt, sourceUrl, note}, verdict, verdictReason, evidenceNotes`

Then a short Vietnamese summary in three parts: **Đã quan sát / Suy luận / Chưa biết**, and the supplier questions.

Unknown is null, never 0. A wrong number is worse than a missing one, because it flows into Hermes' margin math.
