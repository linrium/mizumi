# Cross-Company Journey Dashboard

The cross-company journey dashboard in
`packages/webui/app/(authed)/dashboard/page.tsx` tells an end-to-end
activation story for the VietJet Air and HDBank partnership. It starts with
the executive question, "how much partner value is being created?", then moves
through whitespace discovery, journey monetization, audience qualification,
segment prioritization, recovery risk, next-best actions, and campaign routing.

The dashboard is not only a reporting view. It is structured as a journey
engine: every panel connects a source signal to a destination action so the
business can decide where to activate, what to offer, which channel to use, and
how to measure the value created by each cross-company edge.

## Executive Story

The first row answers the partnership value question in business terms.
VietJet and HDBank each create demand signals for the other company. The
dashboard converts those signals into value, not just audience counts, by
summing `signal_value`, travel spend, booking value, and revenue at risk across
customer audiences.

The story then narrows from total opportunity to actionability:

1. Measure which company-to-company edge creates the most value.
2. Find relationship whitespace where one company has demand but the other has
   not yet activated the customer.
3. Trace which journey transitions and use cases carry the value.
4. Qualify HDBank travel customers into a VietJet activation funnel.
5. Segment the audience by readiness and partner-led activation path.
6. Convert service recovery risk into revenue prioritization.
7. Choose the next-best offer and channel.
8. Route the offer through operational execution paths.

Together, the panels describe a closed loop from partner data to campaign
execution.

## Cross-Company Opportunity Generated

This panel is the executive headline. It groups the offer audience by
`source_company` and `target_company`, then calculates the customer count,
total signal value, and average propensity for each direction of the
partnership.

The key question is: which company is creating monetizable demand for the
other company?

For example, a large `vietjetair → hdbank` bar means VietJet customer behavior
is producing valuable banking opportunities for HDBank. A smaller
`hdbank → vietjetair` bar means HDBank still creates travel activation value,
but at a lower total value in the current audience.

This panel should be read first because it gives leadership the size and
direction of the opportunity before the dashboard moves into operational
details.

## Untapped Cross-Sell Whitespace

The whitespace panel reframes the same partnership from unrealized value
instead of generated opportunity. It looks for customers who already show
demand in one company but do not yet have the destination-company
relationship.

The dashboard compares two open pools:

- HDBank customers with travel spend who do not yet have a VietJet
  relationship.
- VietJet customers with booking value who do not yet have an HDBank
  relationship.

This panel answers: where does demand already exist, but activation has not
happened yet?

The whitespace view is important because a raw relationship split can hide the
commercial opportunity. The panel ranks the gaps by value, so the business can
prioritize the largest unrealized pool instead of treating both partnership
directions as equally urgent.

## Journey Edge Value

The journey edge value panel turns the opportunity into a flow. It uses a
Sankey view to connect each source company to partnership use cases and then to
the destination company. Instead of asking only "how many customers are in the
audience?", it asks "which transitions in the journey graph create the most
economic value?"

This panel shows the monetization edges inside the journey:

- Source company: where the signal originated.
- Use case: the activation reason or customer situation.
- Target company: where the value should be captured.

The largest flows are the journeys that deserve executive attention because
they combine customer volume with measurable signal value. Smaller flows may
still be useful, but they are secondary unless they represent a strategic
segment, a high-margin product, or a recovery path.

## Journey Funnel - HDBank Travel Customers to VietJet Activation

The funnel panel converts the HDBank-to-VietJet opportunity into a staged
activation path. It starts with all HDBank customers, narrows to travel
spenders, then airline or OTA spenders, then customers without a VietJet
relationship, and finally activation candidates.

This panel answers: how much of the HDBank customer base can realistically be
moved into VietJet activation?

Each stage has a different operational meaning:

- All HDBank customers: the full addressable bank relationship base.
- Travel spenders: customers with evidence of travel demand.
- Airline or OTA spenders: customers whose travel spend is specifically
  relevant to flight activation.
- No VietJet relationship yet: customers with demand but no current VietJet
  activation.
- Activation candidates: the refined audience ready for campaign action.

The conversion percentages matter as much as the counts. A large drop between
stages shows where targeting logic, partner data quality, or offer design may
need improvement.

## Activation Segments

The activation segments panel turns the audience into campaign priorities. It
uses cross-sell readiness and frequent-flyer score to classify customers into
activation bands.

The bands describe who should lead and how aggressively the campaign should
move:

- Prime Targets: high readiness and high frequent-flyer score. These are the
  strongest candidates for immediate activation.
- HDBank-led: high cross-sell readiness, where the bank relationship is the
  stronger activation lever.
- VietJet-led: high frequent-flyer behavior, where the airline relationship is
  the stronger activation lever.
- Nurture: lower-readiness customers who may need education, service recovery,
  or lower-commitment offers before conversion.

The current view sorts by customer count, but the panel also includes average
travel spend, booking value, and monthly income so the audience can be judged
economically, not only by size.

## Recovery Risk to Revenue

The recovery risk panel adds a service-quality lens. It focuses on customers
with incidents and groups them by VietJet priority band. For each band, it
calculates customers, revenue at risk, recovery score, average delay minutes,
and average incident count.

This panel answers: where can service recovery protect or recover the most
revenue?

The important shift is from raw incident volume to economic risk. A small
segment with high booking value and poor service experience can be more urgent
than a larger segment with low value. Sorting by recovery score makes the panel
an action list for retention and win-back work.

This is also where the journey story becomes defensive as well as offensive:
the partnership should not only generate new cross-sell demand; it should also
protect high-value customers whose bad experiences may reduce future value.

## Next Best Journey

The next-best journey panel turns use cases into recommended offers and
channels. It shows a Sankey flow from use case to offer name, then from offer
name to recommended channel.

This panel answers: what should happen next for each journey?

The panel moves the dashboard from insight to orchestration. A use case is not
useful unless it can be translated into an offer and delivered through a
channel. For example, a VietJet starter bundle may route to an app channel,
relationship manager, SMS, or email depending on the customer segment and
activation strategy.

This view is especially useful for campaign planning because it exposes whether
too much value is concentrated in one channel, whether relationship-manager
capacity may become a bottleneck, or whether an offer needs a better digital
route.

## Offer Routing

The offer routing panel is the operational lineage view. It connects source
company signals to use cases and then to execution channels, using signal value
as the flow weight.

This panel answers: how does value move from partner signal to production
activation?

The panel is designed for operating the journey, not just explaining it. It
shows whether the highest-value signals are reaching executable channels and
whether the routing design matches the business priority seen earlier in the
dashboard.

When read after the next-best journey panel, offer routing closes the loop:

1. The partnership creates measurable opportunity.
2. Whitespace identifies who has not been activated.
3. Journey edges show where value is created.
4. The funnel qualifies a reachable audience.
5. Segments and recovery risk prioritize who to act on first.
6. Next-best journey selects the offer and channel.
7. Offer routing verifies the production path from signal to execution.

## How to Use the Dashboard in a Review

Start with the cross-company opportunity panel to align on the headline value
and direction of the partnership. Then use whitespace to decide which side of
the partnership has the largest unrealized pool. Use journey edge value to
identify the transitions behind that value, and use the HDBank-to-VietJet
funnel to validate whether the audience is reachable.

After the audience is qualified, use activation segments to choose the first
campaign population. Check recovery risk before launching so high-value
customers with poor service experiences are handled with the right message or
retention path. Finally, use next-best journey and offer routing to confirm
that every priority segment has a concrete offer, channel, and execution path.

The intended outcome of the dashboard review is a campaign decision, not only
an analytical readout: which partner edge to activate, which audience to start
with, which offer to send, which channel should deliver it, and which value
metric should be monitored after launch.
