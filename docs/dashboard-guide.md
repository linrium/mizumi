# Dashboard Guide — What You're Looking At

> A plain-English walkthrough of the Mizumi partnership dashboard for business readers. No technical background needed.

---

## Overview

The Mizumi dashboard gives you a live, bird's-eye view of the partnership between **HDBank** and **VietJet Air**. Think of it as a control room that answers three big questions at once:

1. **Where is the money?** — How much value is flowing between the two companies, and where is opportunity still sitting untouched?
2. **Who are the right customers?** — Which HDBank customers are most ready to become VietJet flyers (and vice versa)?
3. **What should we do next?** — Which offers should go to which customers, through which channels?

Each panel on the dashboard focuses on one piece of that story. Together, they give you a complete picture — from the top-line revenue opportunity all the way down to the individual customer actions that need to happen today.

---

## Section 1 — The Opportunity at a Glance

### Cross-company Opportunity Generated

![Cross-company Opportunity Generated panel](../packages/webui/app/(authed)/dashboard/page.tsx)

This is the **headline number** for the whole partnership. The panel shows two bars side by side:

- **VietJet → HDBank**: how much economic value VietJet customers could bring to HDBank if they were activated as banking customers.
- **HDBank → VietJet**: how much value HDBank customers could bring to VietJet if they started flying with them.

The taller the bar, the bigger the opportunity in that direction. Think of it as a scorecard that tells you, at a glance, which side of the partnership has the most untapped revenue potential right now.

### Untapped Cross-sell Whitespace

Right next to it, this panel zooms in on the **gap** — customers who are already engaged with one brand but haven't crossed over to the other yet.

- **VietJet → HDBank whitespace**: VietJet frequent flyers who don't have an HDBank account yet. These people are already spending on travel; they just haven't been offered the right banking product.
- **HDBank → VietJet whitespace**: HDBank customers who are spending on travel but haven't booked a VietJet flight yet. They're flying somewhere — just not with VietJet.

The bigger the bar, the more "whitespace" (i.e., unrealised revenue) is sitting there waiting to be converted. This panel replaces a simple headcount with actual spending value, so you're looking at *economic* opportunity, not just raw audience size.

---

## Section 2 — How Value Flows

### Journey Edge Value

This is a **flow diagram** (called a Sankey chart) that shows how customer value moves across the partnership. On the left you have the source companies (HDBank and VietJet), in the middle you have the use cases (the specific cross-sell scenarios), and on the right you have the destination companies.

The **width of each flow ribbon** represents the amount of value moving along that path. A thick ribbon means a lot of value; a thin ribbon means a small amount. So instead of just asking "how many customers are in each segment?", this panel answers "which journey paths are actually worth the most money?"

It's the difference between counting footsteps and counting cash. Use this to prioritise which cross-sell scenarios your team should focus on first.

---

## Section 3 — The Customer Journey

### Journey Funnel — HDBank Travel Customers to VietJet Activation

This **funnel chart** tells the story of how HDBank's travel-spending customers progress towards becoming active VietJet flyers. Reading left to right, each stage narrows the audience:

| Stage | What it means |
|---|---|
| **All HDBank customers** (3,808) | Everyone in the HDBank base — the full starting pool. |
| **Travel spenders** (34) | HDBank customers who are actually spending money on travel. |
| **Airline or OTA spenders** (32) | Of those travel spenders, the ones already booking flights or using travel platforms. |
| **No VietJet relationship yet** (24) | The travel-active customers who have *not yet* flown VietJet. This is the core target. |
| **Activation candidates** (325) | The final shortlist — customers who have been scored as high-readiness for a VietJet offer. |

The percentage labels (1%, 1%, 1%, 9%) show the conversion rate at each step. That final jump to 9% at the activation-candidates stage is significant — it tells you the scoring model is doing a good job of concentrating the best prospects into a much smaller, more actionable list.

Use this funnel to understand where customers are dropping off and where the biggest conversion opportunities lie.

---

## Section 4 — Who to Target

### Activation Segments

Once you know *who* to go after, this panel helps you prioritise *how* to approach them. It splits customers into four groups based on two scores — their readiness to switch banks, and their likelihood to fly frequently:

- **Prime Targets** — High on both scores. These are your best bets: customers who are both financially ready and travel-hungry. Go here first.
- **VietJet-led** — Strong frequent-flyer behaviour but lower banking readiness. VietJet should lead the conversation with travel rewards.
- **HDBank-led** — Strong banking engagement but lower flight frequency. HDBank should lead with financial products.
- **Nurture** — Lower scores on both. They're not ready today, but they're worth keeping warm for future campaigns.

The bars show the *size* of each segment, and the description notes the average spending behind each band — so you can see not just how many people are in each group, but how valuable they are.

### Recovery Risk to Revenue

This panel answers a different but equally important question: **which unhappy customers are most at risk of churning, and how much revenue is at stake?**

Rather than simply listing customers who had a bad experience, it sorts them by a *recovery score* — a combination of how unhappy they are and how much they're worth. The result is a priority list where the biggest bar doesn't necessarily mean the most complaints; it means the most *revenue at risk*.

For example, a small group of high-value frequent flyers who experienced flight delays represent a far bigger financial risk than a large group of occasional travellers with minor complaints. This panel makes that distinction visible so the service-recovery team knows exactly where to focus their energy.

---

## Section 5 — The Action Plan

### Next Best Journey

This is where the dashboard shifts from *analysis* to *action*. The flow diagram maps out, for each customer segment (on the left), which specific offer they should receive (in the middle), and through which channel that offer should be delivered (on the right).

For instance:
- Customers without a VietJet relationship are routed to the **VietJet Starter Bundle** offer, most often via a **relationship manager** or **SMS**.
- Customers with low VietJet engagement are matched to the **VietJet Cobrand Card Bonus**.
- Customers without an HDBank relationship are offered **HDBank Fly Now, Pay Later**.

The width of each ribbon again shows volume — how many customers are being routed along each path. This panel is essentially the **playbook**: it tells every sales and marketing team member exactly what to offer, and how to reach out, for every type of customer they encounter.

### Offer Routing

Finally, this panel zooms out to show the **full operational picture** of how the campaign activation works end-to-end. It traces the path from the original data source (VietJet's 431 million sessions or HDBank's 13.6 million sessions) through the specific use case, all the way to the delivery channel.

The channels on the right — **email**, **VietJet app**, **relationship manager**, **HDBank app**, and **SMS** — show where offers will actually land. Email handles the largest volume (374 million sessions), while relationship managers handle the highest-value personal outreach.

Think of this panel as the **logistics map** for the whole campaign. It confirms that every customer signal is being matched to a use case, routed to an offer, and delivered through the right channel — so nothing falls through the cracks before activation.

---

## Putting It All Together

Reading the dashboard top to bottom tells a coherent business story:

1. **There's a big opportunity** — hundreds of millions of dollars in cross-sell whitespace between HDBank and VietJet.
2. **Most of it flows through a few high-value journeys** — the Sankey charts show you exactly which paths matter most.
3. **The activation funnel is working** — only a small fraction of customers make it through each stage, but those who do are high-quality candidates.
4. **We know who to target and how to segment them** — Prime Targets first, then VietJet-led and HDBank-led bands, with a service-recovery track for at-risk customers.
5. **The playbook is ready** — Next Best Journey and Offer Routing turn the analysis into concrete actions with specific offers and channels assigned to every customer type.

In short: the dashboard doesn't just show you what's happening — it tells you what to do about it.
