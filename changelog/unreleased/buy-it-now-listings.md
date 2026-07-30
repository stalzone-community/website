---
title: 'Fixed: buy-it-now lots were missing from "On sale now"'
type: fix
area: market
impact: major
---
Listings with a buy-it-now price and no opening bid were being dropped, so items
sold that way looked like nothing was for sale. Some pages reported "nothing is
listed for this item right now" while the auction actually held dozens of lots.

They are all shown now, and a lot with no bidding side reads "—" in the bid
column instead of a price nobody can bid.
