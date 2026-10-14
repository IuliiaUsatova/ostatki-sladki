# Design source

Editable design: [Остатки — Figma](https://www.figma.com/design/8FZnmYn4ihOn7q1eHQxxfH?node-id=2010-526).

The buyer shell, offer cards, detail, checkout, pickup ticket and order list follow nodes `2010:526`, `2010:715`, `2010:781`, `2010:910` and `2010:983`. Profile follows `2011:693`. Registration/sign-in follow `2011:967` and `2011:938`, with functional account types, password confirmation and café application fields. Email confirmation and password recovery extend the account flow in RU/KK/EN, with real transactional delivery through Brevo. Third-party sign-in provider buttons remain omitted.

Merchant structure follows `2014:2022`, `2014:2158`, `2014:2371` and `2014:2298`. The original blue/white palette, Inter/Roboto typography, spacing and component sizes are adapted to responsive web layouts. The mobile operating-system status bar is excluded from the website.

Assets were fetched from the design-context exports and saved locally. Temporary Figma download URLs are not referenced by runtime code.

| Local asset                      | Design slot                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `public/images/bakery.png`       | Catalogue hero, 100% × 140 px, cover                             |
| `public/images/goa-food.png`     | Offer/order cards, 96 × 108 px, cover                            |
| `public/images/croissant.png`    | Bakery offer cards, 96 × 108 px, cover                           |
| `public/images/goa-interior.png` | Bag detail, full width × 212 px; merchant editor, 356 × 190 px   |
| `public/icons/*.svg`             | Navigation/back icons, whole asset, contained in the design slot |

The public catalogue has added search and live quantity display. Dates, quantities and orders come from the database rather than the static Figma fixtures. The English-first interface and language selector are additions requested by the author. Moderation follows the operational workspace structure, with a review queue, application details, decisions and audit.
