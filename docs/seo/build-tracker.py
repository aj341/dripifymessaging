import openpyxl, datetime as dt
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
F='Arial'
wb=openpyxl.Workbook()
def style_title(ws, title, subtitle, ncols):
    ws['A1']=title; ws['A1'].font=Font(name=F,size=14,bold=True)
    ws.merge_cells(start_row=1,start_column=1,end_row=1,end_column=ncols)
    ws['A2']=subtitle; ws['A2'].font=Font(name=F,size=10,italic=True,color='555555'); ws['A2'].alignment=Alignment(wrap_text=True,vertical='top')
    ws.merge_cells(start_row=2,start_column=1,end_row=2,end_column=ncols); ws.row_dimensions[2].height=32
def header(ws,row,cols,widths):
    fill=PatternFill('solid',fgColor='1F2A37'); thin=Side(style='thin',color='CCCCCC')
    for i,(h,w) in enumerate(zip(cols,widths),1):
        c=ws.cell(row=row,column=i,value=h); c.font=Font(name=F,size=10,bold=True,color='FFFFFF'); c.fill=fill; c.alignment=Alignment(vertical='center',wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.freeze_panes=ws.cell(row=row+1,column=1)
def body(ws,start_row,rows,ncols,wrap_cols=()):
    thin=Side(style='thin',color='DDDDDD')
    for r,vals in enumerate(rows,start_row):
        for c in range(1,ncols+1):
            v=vals[c-1] if c-1<len(vals) else None
            cell=ws.cell(row=r,column=c,value=v); cell.font=Font(name=F,size=10); cell.alignment=Alignment(vertical='top',wrap_text=True); cell.border=Border(bottom=thin)
GSC='https://search.google.com/search-console?resource_id=sc-domain:designbees.com.au'
REPORT='https://claude.ai/code/artifact/e3ddf06b-bfc3-4925-92d9-458fc2c3dfb2'
AHREFS='https://app.ahrefs.com/site-audit/9577405/overview'
PEEK='https://www.aipeekaboo.com/'
SEM='https://www.semrush.com/siteaudit/?domain=www.designbees.com.au'
# ================= Task Tracker =================
ws=wb.active; ws.title='Task Tracker'
style_title(ws,'Design Bees — AEO/SEO Task Tracker (from the Visibility Report, 10 Sep 2026)','Work through P0 first. Update Status after each change in Wix, then use the Verification column to confirm on the live site or in Search Console. Source URLs point at the evidence for each task; the full report is the Summary tab link.',13)
cols=['Task ID','Priority','Status','Workstream','Task','Wix location','Proposed change / acceptance','Effort','Owner','Due date','Source URL','Verification','Notes']
widths=[9,9,16,18,40,32,46,9,12,12,34,40,34]
header(ws,4,cols,widths)
T=[
('T01','P0','Not started','Schema','Fix the Product-snippet warnings (missing review, aggregateRating, availability) on the pricing and package pages.','Wix Studio > Pages > (page) > SEO basics > Structured data markup, or Velo custom code on /one-off-packages/logo-and-branding-package and /pricing-cards','Either add a real aggregateRating from the Google Reviews sheet plus an availability value, or change the packages from Product/Offer to Service/Offer so Product-snippet rules stop applying. Validate in the Rich Results Test, then Request indexing.','Medium','Miguel',None,GSC,'Search Console > Enhancements > Product snippets shows 0 issues after Validate fix completes.','Product snippets carried 13,419 impressions and 110 clicks in 3 months (report E2), so this touches real traffic. Alert 9 Sep 2026.'),
('T02','P0','Not started','Schema','Fix the Merchant-listing warnings (availability, hasMerchantReturnPolicy, shippingDetails, gtin/brand).','Same as T01','These fields are for physical goods. Service schema for design packages removes Merchant-listing eligibility; if Product stays, add the four fields.','Medium','Miguel',None,GSC,'Search Console > Enhancements > Merchant listings shows 0 issues.','Alert 9 Sep 2026: 4 issues.'),
('T03','P0','Not started','Homepage snippet','Rewrite the homepage title (under 60 characters) and meta description (under 155) as a direct answer with the $545 price.','Wix Studio > Pages > Home > SEO basics','Title: "Unlimited Graphic Design Australia from $545/mo | Design Bees". Meta: "Unlimited graphic design for Australian businesses from $545 a month. Dedicated designer, unlimited requests and revisions, 10-day free trial, no contract." Confirm lengths in Wix before saving.','Low','AJ / Claude',None,GSC,'After 4 weeks: CTR for "graphic design services" and "graphic design services australia" in Search Console > Queries. Semrush title and meta checks pass.','Export 9 Jun–8 Sep: "graphic design services" 1,787 impressions at position 4.6, CTR 0.22%. Ranking is done; the snippet is not converting.'),
('T04','P0','Not started','Homepage clarity','Rewrite the first 100 words of the homepage as an answer to "graphic design services in Australia": what it is, from $545/month, AEST hours, 10-day trial.','Wix Studio > Pages > Home > hero text (keep the H1)','One answer-first paragraph directly under the H1; no feature list before it.','Low','AJ / Claude',None,REPORT,'Same CTR check as T03; homepage citations in the Peekaboo re-run stay at or above 16.','Homepage carries 20% of Google AI-feature impressions (report E1).'),
('T05','P0','Not started','City pages','Rewrite the Sydney page title and meta to win the click at position 2.','Wix Studio > Pages > design-solutions/graphic-design-sydney > SEO basics','Title such as "Graphic Design Services Sydney from $545/mo | Design Bees"; meta with Surry Hills studio, AEST hours, 10-day trial. Apply the same pattern to Melbourne, Brisbane, Perth, Adelaide once it works.','Low','AJ / Claude',None,GSC,'CTR above 2% on "graphic design services sydney" after 4 weeks (Search Console > Queries).','Export: 122 impressions, position 2.1, 0 clicks. Page average position 30.8 overall.'),
('T06','P0','Not started','Page speed','Reduce homepage JavaScript: audit installed Wix apps (Hotels, Chat, File Share, Members Area, Pay Links, Forms), remove unused ones, defer chat and third-party scripts.','Wix Dashboard > Apps > Manage apps; Settings > Custom code','Interaction to Next Paint under 0.5 s and Total Blocking Time under 0.5 s on PageSpeed Insights (mobile). Google\'s "good" threshold is 0.2 s.','High','Miguel',None,'https://pagespeed.web.dev/','PageSpeed Insights before and after; log INP and TBT in the Tracking tab.','Semrush 10 Sep: INP 6.186 s, TBT 1.065 s, performance 56/100.'),
('T07','P1','Not started','Technical','Fix the HTTPS page that links to HTTP, and the redirect chain.','Wix footer links; Dashboard > SEO > URL Redirect Manager','Every internal link uses https://www.designbees.com.au/...; redirects are single-hop.','Low','Miguel',None,AHREFS,'Next Ahrefs crawl: 0 errors, no redirect chain.','Ahrefs 9 Sep: 1 error, 3 warnings on 3 crawled URLs.'),
('T08','P1','Not started','Canonical','Check the http://www.designbees.com.au/ redirect and the homepage canonical.','Wix > Settings > Domains; Search Console > URL inspection','http redirects 301 to https; canonical tag is https://www.designbees.com.au/; Google-selected canonical matches.','Low','Miguel',None,GSC,'URL inspection shows the https URL as Google-selected canonical; the http row fades from Search Console > Pages.','Export Pages tab: http URL recorded separately with 10,608 impressions, 57 clicks, position 5.4.'),
('T09','P1','Not started','On-page','Add alt text to images missing it (client logos, carousel, portfolio gallery).','Wix image settings on Home and /our-work','Descriptive alt text on every content image.','Low','Miguel',None,SEM,'Semrush SEO Checker: Image Alt passes.','Flagged 10 Sep.'),
('T10','P1','Not started','Social','Add Instagram and X profile links to the footer social bar.','Wix Studio > footer > social bar','Working links to the live profiles.','Low','AJ',None,SEM,'Semrush social checks pass for Instagram and X.','Facebook, YouTube and LinkedIn already found.'),
('T11','P0','Not started','AEO page','Publish /design-pickle-alternative-australia.','Wix Studio > Pages > Add page','Comparison table (Design Bees vs Design Pickle, ManyPixels, Penji, Reel Unlimited), AUD pricing, AEST support, FAQ block with FAQPage schema, links from the Top 7 post and the homepage.','Medium','AJ / Claude',None,PEEK,'Live, in the pages sitemap, indexed (URL inspection). Peekaboo prompt "Design Pickle alternative in Australia" above 70 after 30 days.','Peekaboo 10 Sep: 51, reached through other companies\' listicles. Export: "design bees vs penji vs design pickle for small teams" 12 impressions, position 9.6.'),
('T12','P1','Not started','AEO page','Publish the freelancer-replacement page (temporary graphic designer cover).','Wix Studio > Pages or Blog','Answer the "my freelancer got too costly / went on leave" question first; FAQ with FAQPage schema; link from the pricing guide.','Medium','AJ / Claude',None,PEEK,'Live and indexed; Peekaboo discovery prompt score above 0; the "(for australia)" comparison queries gain clicks.','Peekaboo: 0 mentions in 8 runs. Export: "graphic design subscription service vs hiring a local australian designer (for australia)" 39 impressions, position 1.1, 0 clicks. Draft exists in the repo (server/data/drafts).'),
('T13','P0','Not started','Off-site authority','Complete and optimise the Google Business Profile: services, price range, AEST hours, photos, and a review request to five recent clients.','External: business.google.com (Surry Hills listing)','Category "Graphic designer", services list matching the six target questions, price range from $545/mo, 10+ recent photos, five new reviews in 60 days.','Medium','AJ',None,'https://business.google.com/','Live check: ask ChatGPT "graphic design services Sydney" monthly and confirm Design Bees still appears; profile shows the price range and services.','11 Sep live check: ChatGPT returned the Google map pack for the Sydney query and Design Bees ranked first, so the profile is doing the work Peekaboo scores as 0. Peekaboo under-reports this.'),
('T14','P1','Not started','Off-site authority','Get listed in the third-party comparison posts the engines cite.','External outreach','Pitch inclusion (pricing, turnaround, 5.0/44 rating) to flocksy.com, digitalpolo.com, sourceforge.net, hatchwise.com, medium.com roundups and the reddit threads.','High','AJ',None,PEEK,'Named in at least three of the cited lists; ChatGPT prompt score in Peekaboo above 0 for "graphic design services (Australia)".','Peekaboo D4: manypixels.co 27 citations, flocksy.com 21, digitalpolo.com 18, reddit.com 16, sourceforge.net 11.'),
('T15','P1','Not started','Peekaboo','Add the Australian competitors (Reel Unlimited, Graphiker, Lumin) and the Sydney and freelancer prompts to Peekaboo; note the trial end date.','aipeekaboo.com > Competitors, Prompts','Tracked set reflects who the engines actually cite.','Low','AJ',None,PEEK,'Competitor table in Peekaboo updated; scores exported to the Tracking tab before the trial ends.','Free trial started 10 Sep 2026; 14 days.'),
('T16','P1','Not started','Content hygiene','Unpublish the placeholder post /post/your-title-what-s-your-blog-about.','Wix Blog','Returns 404 and drops out of the blog sitemap.','Low','Miguel',None,'https://www.designbees.com.au/post/your-title-what-s-your-blog-about','URL returns 404; not in blog-posts-sitemap.xml.','Still live on 10 Sep 2026.'),
('T17','P1','Not started','Thin pages','Build out or noindex the four thin indexable pages: /design-subscriptions-for-construction, /design-subscriptions-for-manufacturing, /options-to-scale-design, /affiliate-library.','Wix Studio > Pages','Either at least 600 words with an FAQ and Service schema, or noindex and removal from the sitemap.','Medium','AJ / Miguel',None,REPORT,'Each URL is either substantive or noindexed; sitemap matches.','Live check 10 Sep: about 160–230 words each, no schema.'),
('T18','P1','Not started','Entity','Add Organization / LocalBusiness schema to /about; give /faq-general a title or noindex it.','Wix Studio > Pages > About > SEO basics; FAQ pages','Valid Organization schema on /about; every indexable page has a title tag.','Low','Miguel',None,'https://search.google.com/test/rich-results','Rich Results Test passes; Semrush title check passes on /faq-general.','Live check 10 Sep: /about has 0 JSON-LD blocks; /faq-general returned no title.'),
('T19','P2','Not started','Accuracy','Make /reviews state "plans from $545 a month" explicitly near the top.','Wix Studio > Pages > Reviews','One plain sentence with the entry price.','Low','AJ',None,REPORT,'Re-ask "Design Bees review" in Google AI Mode monthly; price quoted correctly.','June audit: Google AI Overview quoted "from around $900/month" from this page.'),
('T20','P1','Not started','Cannibalisation','Fix "graphic design subscription": assign one owner page and point the others at it.','Wix pages and blog, keyword ownership map','One URL ranks; competing posts link to it with the exact anchor and stop targeting it in titles.','Medium','AJ / Claude',None,GSC,'Position for "graphic design subscription" back under 15 within 8 weeks.','Export: position moved from 12.7 (June) to 24.1 (now); 265 impressions, 0 clicks.'),
('T21','P2','Not started','Logo cluster','Lift CTR on the logo-and-branding cluster with a price-led title and meta on the package page.','Wix Studio > Pages > one-off-packages/logo-and-branding-package > SEO basics','Title includes the package price and "Australia"; meta names what is included.','Low','AJ / Claude',None,GSC,'CTR above 1% on "logo package" and "branding package" after 4 weeks.','Export: "brand design" 1,277 impressions at 17.5; "logo package" 504 at 7.0; page CTR 0.8%.'),
('T22','P2','Not started','Internal linking','Link the five city pages and the Top 7 post from the homepage or footer and from the pricing guide.','Wix Studio > footer, homepage, blog post','Each of those pages has at least two internal links from top pages.','Low','AJ / Claude',None,REPORT,'Impressions for the city pages rise in the Generative AI pages report next month.','Generative AI export: city pages 6–19 impressions each versus 4,156 for the pricing guide.'),
('T23','P2','Not started','Measurement','Create a GA4 channel group "AI Search" (source matches chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com).','GA4 Admin > Data display > Channel groups','Channel visible in Acquisition reports.','Low','AJ',None,'https://analytics.google.com/','Sessions by the AI Search channel logged weekly in the Tracking tab.','Proposed in the 3 Jun 2026 plan; not yet done.'),
('T24','P2','Not started','Measurement','Monthly: re-run Semrush SEO Checker, Semrush AI Visibility, HubSpot AI Search Grader and Peekaboo with identical inputs, plus both Search Console exports; log in the Tracking tab.','Tools listed on the Sources tab','Same inputs every time: Design Bees, Australia, unlimited graphic design subscription, marketing and advertising.','Low','AJ / Claude',None,REPORT,'Tracking tab has a dated row per metric each month.','First data point: 10 Sep 2026.'),
('T25','P2','Not started','Measurement','Monthly: run the six target prompts in ChatGPT (temporary chat), Google AI Mode, Perplexity and Gemini; log appears / cited / price correct.','Manual, same wording each time','Prompts are the six on the Summary tab.','Low','AJ',None,REPORT,'Tracking tab rows with Source "Manual AI check".','Method from the 3 Jun 2026 audit.'),
('T26','P2','Not started','Indexing','Watch the four retired vertical pages and the http variant in the Generative AI pages report; resubmit the sitemap if they persist past 30 days.','Search Console > Performance > Generative AI > Pages; Sitemaps','Impressions on retired URLs fade to zero.','Low','Miguel',None,GSC,'Retired URLs absent from the Pages tab in the October export.','Their 301s are in place (checked 10 Sep).'),
('T27','P2','Not started','Content refresh','Update the 2025 trends post to 2026 in place (title, dateModified, content).','Wix Blog','Same URL; updated year; refreshed examples.','Low','AJ / Claude',None,'https://www.designbees.com.au/post/top-5-must-know-graphic-design-trends-for-small-and-medium-businesses-in-2025','Live with 2026 in the title.','Keyword map: refresh, do not create a new post.'),
('T28','P2','Not started','Case studies','Clean case-study slugs containing apostrophes, commas and "!" and set 301 redirects.','Wix Studio > Pages > case studies; URL Redirect Manager','Plain-text slugs; canonical tags match the clean URL.','Medium','Miguel',None,GSC,'Search Console > Pages shows the clean URLs only.','Export still shows encoded URLs such as the XV Premium and Pappa Flock case studies.'),
('T29','P0','Not started','Off-site authority','Claim and complete Clutch, G2 and DesignRush profiles; ask five clients for reviews.','External: clutch.co, g2.com, designrush.com','Profiles complete with pricing, turnaround, AEST hours; five reviews within 60 days.','Medium','AJ',None,PEEK,'Profiles live; reviews visible; G2 citations rise in the Peekaboo sources table.','Peekaboo cites g2.com 3 times with no claimed profile. HubSpot share of voice 0/10 on ChatGPT and Gemini. Was T13 before the 11 Sep live checks.'),
('T30','P1','Not started','Content refresh','Strengthen the post the engines already cite: /post/are-unlimited-graphic-design-services-truly-limitless-what-you-need-to-know.','Wix Blog > that post','Add the $545 entry price, an AEST turnaround line, and an FAQ block with FAQPage schema; link to the pricing guide and the Design Pickle comparison.','Low','AJ / Claude',None,'https://www.designbees.com.au/post/are-unlimited-graphic-design-services-truly-limitless-what-you-need-to-know','Re-run the six prompts monthly; this URL keeps appearing as the cited source and now quotes the price correctly.','11 Sep live check: cited by ChatGPT and by Google AI Mode across several of the six queries. It is the strongest citation asset the site has.'),
]
body(ws,5,T,13)
last=4+len(T)
for c,opts in (('B','"P0,P1,P2"'),('C','"Not started,In progress,Blocked,Needs verification,Done"'),('H','"Low,Medium,High"')):
    dv=DataValidation(type='list',formula1=opts,allow_blank=True); ws.add_data_validation(dv); dv.add(f'{c}5:{c}1000')
for r in range(5,last+1): ws.cell(row=r,column=10).number_format='yyyy-mm-dd'
# ================= Summary =================
ws=wb.create_sheet('Summary')
style_title(ws,'AEO/SEO Checklist Summary — Design Bees','Target questions: (1) Best unlimited graphic design subscription in Australia · (2) How much does unlimited graphic design cost in Australia? · (3) Graphic design services (Australia) · (4) Graphic design services Sydney · (5) Design Pickle alternative Australia · (6) What do small businesses switch to when a freelance designer gets too costly?',8)
ws.row_dimensions[2].height=48
for c,w in zip('ABCDEFGH',[28,14,4,14,10,4,30,40]): ws.column_dimensions[c].width=w
hdr=Font(name=F,size=10,bold=True)
ws['A4']='Metric'; ws['B4']='Value'; ws['D4']='Priority'; ws['E4']='Tasks'
for c in ('A4','B4','D4','E4'): ws[c].font=hdr
rows=[('Total tasks',"=COUNTA('Task Tracker'!$A$5:$A$1000)"),('Done','=COUNTIF(\'Task Tracker\'!$C$5:$C$1000,"Done")'),('In progress','=COUNTIF(\'Task Tracker\'!$C$5:$C$1000,"In progress")'),('Blocked','=COUNTIF(\'Task Tracker\'!$C$5:$C$1000,"Blocked")'),('Needs verification','=COUNTIF(\'Task Tracker\'!$C$5:$C$1000,"Needs verification")'),('Completion','=IF(B5=0,0,B6/B5)')]
for i,(a,b) in enumerate(rows,5):
    ws.cell(row=i,column=1,value=a).font=Font(name=F,size=10); ws.cell(row=i,column=2,value=b).font=Font(name=F,size=10)
ws['B10'].number_format='0%'
for i,p in enumerate(('P0','P1','P2'),5):
    ws.cell(row=i,column=4,value=p).font=Font(name=F,size=10); ws.cell(row=i,column=5,value=f"=COUNTIF('Task Tracker'!$B$5:$B$1000,D{i})").font=Font(name=F,size=10)
ws['G4']='Baseline, 10 Sep 2026 (actual)'; ws['G4'].font=hdr; ws['H4']='Source'; ws['H4'].font=hdr
base=[('Semrush SEO score','50 / 100','Semrush SEO Checker, run by AJ'),('Performance / INP / TBT','56 · 6.186 s · 1.065 s','Semrush SEO Checker'),('HubSpot AI Search Grader','ChatGPT 43 · Perplexity 51 · Gemini 44','HubSpot, session run'),('Peekaboo visibility','56 / 100 (5 prompts × 4 engines, 40 runs)','Peekaboo MCP, AJ authorised'),('Semrush AI Visibility','Free checker 0 · dashboard (AU) 14','Semrush, run by AJ'),('Google AI-feature impressions, 92 days','7,865','Search Console Generative AI export'),('Web clicks / impressions, 92 days','930 / 65,504 · CTR 1.42%','Search Console Search results export'),('"graphic design services"','1,787 impressions · position 4.6 · CTR 0.22%','Search Console Search results export'),('Ahrefs health (3 URLs)','93 / 100','Ahrefs Site Audit email 9 Sep')]
for i,(a,b,c) in enumerate(base,5):
    ws.cell(row=i,column=7,value=a).font=Font(name=F,size=10); ws.cell(row=i,column=8,value=b+'  —  '+c).font=Font(name=F,size=10); ws.cell(row=i,column=8).alignment=Alignment(wrap_text=True)
ws['A16']='How to use'; ws['A16'].font=hdr; ws.merge_cells('A16:H16')
ws['A17']=('Start with the P0 tasks on the Task Tracker tab. Set Status as you work in Wix; use "Needs verification" until the Verification column check has been done on the live site or in Search Console. '
          'Evergreen Pages lists the pages that answer the six target questions and which are still to build. Sources holds every evidence and implementation link. Tracking is the monthly log: add a row per metric each month with the same inputs, and the Latest block updates itself. '
          'Full report: '+REPORT)
ws['A17'].font=Font(name=F,size=10); ws['A17'].alignment=Alignment(wrap_text=True,vertical='top'); ws.merge_cells('A17:H20'); ws.row_dimensions[17].height=30
# ================= Sources =================
ws=wb.create_sheet('Sources')
style_title(ws,'Evidence & Implementation Sources — Design Bees','URLs kept as plain text so they can be copied into Wix or a browser. "Observed evidence" = what was measured; "Implementation" = where to make or check a change; "Diagnostic" = re-run for before/after.',4)
header(ws,4,['Source','URL','Use','Notes'],[30,62,20,50])
S=[('Visibility report (full)',REPORT,'Observed evidence','All findings, sources and dates; appendices A–I. Also in the repo at docs/seo/.'),
('Live homepage','https://www.designbees.com.au/','Observed evidence','Title 61 chars, meta 149 chars, 2 JSON-LD blocks, about 1,750 visible words.'),
('Sitemap index','https://www.designbees.com.au/sitemap.xml','Observed evidence','38 pages + 23 posts on 10 Sep 2026.'),
('robots.txt','https://www.designbees.com.au/robots.txt','Observed evidence','Member and checkout paths disallowed.'),
('Google Search Console property',GSC,'Observed evidence','Domain property; Performance > Search results and Performance > Generative AI; exports in the repo under docs/seo/data.'),
('Semrush SEO Checker','https://www.semrush.com/free-tools/seo-checker/','Diagnostic','Free; run monthly with www.designbees.com.au. Human-verification check blocks headless runs.'),
('Semrush AI Visibility Checker','https://www.semrush.com/free-tools/ai-search-visibility-checker/','Diagnostic','Free; broad prompt sample; score 0 on 10 Sep.'),
('HubSpot AI Search Grader','https://www.hubspot.com/ai-search-grader','Diagnostic','Free, no account; inputs Design Bees / Australia / Unlimited graphic design subscription / Marketing and Advertising.'),
('HubSpot result, 10 Sep 2026','https://www.hubspot.com/ai-search-grader/results?companyName=Design+Bees&geography=Australia&productsServices=Unlimited+graphic+design+subscription&industry=Marketing+and+Advertising','Observed evidence','ChatGPT 43, Perplexity 51, Gemini 44.'),
('Peekaboo',PEEK,'Diagnostic','Free trial from 10 Sep 2026 (14 days); MCP endpoint https://www.aipeekaboo.com/api/mcp; brand id 261cc21a-ebca-4344-a587-ca121e946303.'),
('Ahrefs Site Audit (free)',AHREFS,'Diagnostic','Weekly crawl emails; only 3–4 URLs on the free tier.'),
('PageSpeed Insights','https://pagespeed.web.dev/','Diagnostic','Free; INP, TBT, LCP, CLS before and after T06.'),
('Rich Results Test','https://search.google.com/test/rich-results','Implementation','Validate schema changes for T01, T02, T18.'),
('Schema.org validator','https://validator.schema.org/','Implementation','Syntax check for JSON-LD.'),
('Wix Studio editor','https://manage.wix.com/','Implementation','Pages > SEO basics for titles, metas and structured data; Apps > Manage apps for T06; SEO > URL Redirect Manager for T07, T08, T28.'),
('GA4','https://analytics.google.com/','Implementation','Admin > Data display > Channel groups for T23.'),
('June GSC review (3-month baseline to 3 Jun 2026)','https://docs.google.com/spreadsheets/d/19te5LI2Gz8v7K0N3PITVGwa41Re0hYLEfqqs2sePeoA','Observed evidence','Query positions before the June/July work; compared in report E2a.'),
('AEO Visibility Audit, 3 Jun 2026','https://docs.google.com/spreadsheets/d/1iFoJM2y6VKBKKtGCLCwfXMhYl-4q7NvX88iLvhTGKwQ','Observed evidence','Five prompts × three engines, manual.'),
('SEO & AEO Next Steps, 24 Jul 2026','https://docs.google.com/spreadsheets/d/1CnIDt4lOnPiUoKXeGcQsLsxd3fQoc9oa8hbYG1fEe7A','Observed evidence','Earlier checklist; several items carried into this tracker.'),
('Full Site Fix List, 3 Jun 2026','https://docs.google.com/spreadsheets/d/1kUCu1IhJtb7SZz2876pMK4-QPSfWUt53ztpP82nyphA','Observed evidence','Page-by-page fixes and their status as of July.'),
('Keyword ownership map (repo)','https://github.com/aj341/dripifymessaging/blob/main/server/data/blog-engine/keyword-ownership-map.md','Implementation','One keyword cluster, one page; check before writing.'),
('Pull request with report and data','https://github.com/aj341/dripifymessaging/pull/42','Observed evidence','HTML, PDF, CSV exports and raw Peekaboo output.')]
body(ws,5,S,4)
# ================= Evergreen Pages =================
ws=wb.create_sheet('Evergreen Pages')
style_title(ws,'Design Bees — Evergreen Search Pages','The pages that answer the six target questions: four live, two to build. Primary query owns the page; supporting queries are secondary mentions only (see the keyword ownership map).',11)
header(ws,4,['Page ID','Priority','Status','Page','Planned URL','Primary query','Supporting queries','Content role','Refresh cadence','Publish acceptance','Draft file'],[9,9,16,32,44,30,40,36,20,40,30])
E=[('P01','P1','Published','7 Best Design Subscriptions for Creative Teams (2026)','https://www.designbees.com.au/post/top-7-design-subscriptions-for-creative-teams-2026','best unlimited graphic design subscription in australia','best design subscription australia; best unlimited graphic design service; design subscription comparison','Comparison listicle that positions Design Bees first among Australian options; the page engines cite for "best" prompts (Peekaboo 88).','Quarterly: prices, competitor facts, dateModified','Prices and competitor claims current; internal links to the pricing guide and Design Pickle page; Peekaboo "best" prompt stays above 80.','Live'),
('P02','P1','Published','Graphic Design Prices in Australia: 2026 Cost Guide','https://www.designbees.com.au/post/graphic-design-costs-in-australia-your-pricing-guide','how much does unlimited graphic design cost in australia','graphic design cost; graphic designer cost; freelance graphic designer hourly rate australia; graphic design pricing','The site\'s workhorse: 328 clicks and 4,156 AI-feature impressions in 3 months; answers cost questions with the $545–$2,645 range.','Quarterly: figures, year in title, dateModified','Prices match the pricing page; a direct-answer block at the top; Key Takeaways box.','Live'),
('P03','P0','In build','Homepage','https://www.designbees.com.au/','graphic design services (australia)','graphic design services australia; unlimited graphic design australia; graphic design agency australia','Entity and category landing page; owns the head terms; T03 and T04 rewrite the snippet and opening.','Monthly check of title, meta and CTR','Title under 60 and meta under 155 with $545; answer-first opening; CTR above 1% on "graphic design services".','Live (rewrite pending)'),
('P04','P0','In build','Graphic Design Services Sydney','https://www.designbees.com.au/design-solutions/graphic-design-sydney','graphic design services sydney','graphic design sydney; graphic designer sydney; graphic design surry hills','City page with local proof (Surry Hills studio, AEST hours); ranks at position 2.1 with 0 clicks, so the snippet is the job (T05).','Quarterly','CTR above 2% on the primary query; cited by AI engines (13 mentions on 31 Aug).','Live (snippet rewrite pending)'),
('P05','P0','Not started','Design Pickle alternative in Australia','https://www.designbees.com.au/design-pickle-alternative-australia','design pickle alternative australia','design bees vs design pickle; design pickle alternatives; unlimited graphic design australia vs design pickle','Honest comparison table with AUD pricing and AEST support as the wedge; the page that lets engines cite Design Bees directly instead of via others\' listicles (Peekaboo 51).','Quarterly: competitor prices','Live, indexed, linked from P01 and the homepage; Peekaboo prompt above 70 after 30 days.','To write (T11)'),
('P06','P1','Draft ready','Temporary graphic designer cover in Australia','https://www.designbees.com.au/temporary-graphic-designer-cover-australia','what do small businesses switch to when a freelance designer gets too costly','temporary graphic designer; graphic designer maternity leave cover; graphic design subscription service vs hiring a local designer','Problem-framed page for buyers who describe the situation, not the category; the one prompt where no engine names Design Bees (Peekaboo 0).','Half-yearly','Live and indexed; the "(for australia)" comparison queries gain clicks; Peekaboo discovery prompt above 0.','server/data/drafts/seed-drafts.js (slug temporary-graphic-designer-cover-australia)'),
('P07','P2','Draft ready','Design subscription vs freelancer vs agency vs in-house','https://www.designbees.com.au/post/design-subscription-vs-freelancer-vs-agency-vs-in-house','design subscription vs freelancer vs agency','in-house vs outsourced design; freelance graphic designer vs graphic design agency in australia','Comparison pillar with vs-sections inside one page; supports P06 and the pricing guide.','Half-yearly','Live; links to P02 and P06 with exact anchors; no overlap with P01 titles.','server/data/drafts/seed-drafts.js')]
body(ws,5,E,11)
for c,opts in (('B','"P0,P1,P2"'),('C','"Not started,Draft ready,In build,Needs verification,Published,Paused"')):
    dv=DataValidation(type='list',formula1=opts,allow_blank=True); ws.add_data_validation(dv); dv.add(f'{c}5:{c}200')
# ================= Tracking =================
ws=wb.create_sheet('Tracking')
style_title(ws,'Tracking log — one row per metric per reading','Add rows as you re-run each tool (same inputs every time). Columns A–E are the log; the Latest block on the right reads the most recent value per metric automatically. Baseline rows are the 10 Sep 2026 readings from the report.',12)
header(ws,4,['Date','Source','Metric','Value','Notes','','Metric (latest)','Latest value','As at','','',''],[12,26,40,12,44,3,40,12,12,3,3,3])
d0=dt.date(2026,9,10); d1=dt.date(2026,9,11)
L=[(d0,'Semrush SEO Checker','SEO score (0–100)',50,'homepage, run by AJ'),
(d0,'Semrush SEO Checker','Performance score (0–100)',56,''),
(d0,'Semrush SEO Checker','Interaction to Next Paint (s)',6.186,'Google good = 0.2'),
(d0,'Semrush SEO Checker','Total Blocking Time (s)',1.065,'Google good = 0.2'),
(d0,'Semrush AI Visibility Checker','AI Visibility Score',0,'2 mentions, 4 citations, reach 458'),
(d0,'Semrush AI Visibility Checker','Mentions',2,'both Google AI Mode'),
(d0,'Semrush dashboard (AU)','AI Visibility',14,'1 mention, 9 cited pages'),
(d0,'HubSpot AI Search Grader','ChatGPT overall (0–100)',43,'share of voice 0/10'),
(d0,'HubSpot AI Search Grader','Perplexity overall (0–100)',51,'share of voice 4/10'),
(d0,'HubSpot AI Search Grader','Gemini overall (0–100)',44,'share of voice 0/10'),
(d0,'Peekaboo','Visibility (0–100)',56,'5 prompts × 4 engines, 40 runs'),
(d0,'Peekaboo','Prompt: cost in Australia',100,''),
(d0,'Peekaboo','Prompt: best subscription in Australia',88,''),
(d0,'Peekaboo','Prompt: Design Pickle alternative',51,''),
(d0,'Peekaboo','Prompt: graphic design services (Australia)',40,'ChatGPT 0, Gemini 0'),
(d0,'Peekaboo','Prompt: freelancer too costly',0,'0 mentions in 8 runs'),
(d0,'Peekaboo','Competitor: ManyPixels',23,'same-day score'),
(d0,'Peekaboo','Competitor: Design Pickle',17,'same-day score'),
(d0,'Search Console Generative AI','AI-feature impressions, last 28 days',2291,'12 Aug – 8 Sep; previous 28 days 2,986'),
(d0,'Search Console Generative AI','AI-feature impressions, pricing guide (92 days)',4156,''),
(d0,'Search Console Search results','Clicks, last 3 months',930,'9 Jun – 8 Sep'),
(d0,'Search Console Search results','Impressions, last 3 months',65504,''),
(d0,'Search Console Search results','Position: graphic design services',4.6,'1,787 impressions, CTR 0.22%'),
(d0,'Search Console Search results','Position: graphic design services sydney',2.1,'122 impressions, 0 clicks'),
(d0,'Search Console Search results','Position: unlimited graphic design',18.6,''),
(d0,'Search Console Search results','Position: graphic design subscription',24.1,'was 12.7 in June'),
(d0,'Search Console Search results','Brand share of itemised clicks (%)',64,'212 of 329'),
(d0,'Ahrefs Site Audit','Health score (3 URLs)',93,'9 Sep crawl'),
(d0,'SearchAtlas LLM Visibility','Sydney page AI mentions',13,'31 Aug email'),
(d0,'Manual AI check','ChatGPT names Design Bees for "best unlimited graphic design subscription in Australia" (1 = yes)',0,'June audit result; re-check monthly'),
(d1,'Manual AI check','ChatGPT names Design Bees for "best unlimited graphic design subscription in Australia" (1 = yes)',1,'11 Sep live check from AJ\'s own browser: named'),
(d1,'Manual AI check','ChatGPT: target queries naming Design Bees (of 6)',5,'11 Sep live check; only the freelancer question missed'),
(d1,'Manual AI check','Google AI Mode: target queries naming Design Bees (of 6)',6,'11 Sep live check; includes the freelancer query, won on AI Mode')]
body(ws,5,L,5)
for r in range(5,5+len(L)): ws.cell(row=r,column=1).number_format='yyyy-mm-dd'
metrics=[]; seen=set()
for row in L:
    if row[2] not in seen: seen.add(row[2]); metrics.append(row[2])
for i,m in enumerate(metrics,5):
    ws.cell(row=i,column=7,value=m).font=Font(name=F,size=10); ws.cell(row=i,column=7).alignment=Alignment(wrap_text=True,vertical='top')
    # Find the LAST row whose Metric matches, then INDEX the Value and Date out of it.
    # The array arithmetic multiplies the match test by ROW() only, never by the cell
    # contents, so text anywhere in columns A-D cannot poison it. The previous version
    # multiplied the test by $A$5:$A$1000 directly, and the legend text sitting in
    # column A turned every cell of this block into #VALUE! in Google Sheets.
    # SUMPRODUCT forces array context, so no Ctrl+Shift+Enter and no _xlfn prefix:
    # this evaluates the same in Excel, LibreOffice and Google Sheets.
    idx=f'SUMPRODUCT(MAX(($C$5:$C$1000=$G{i})*(ROW($C$5:$C$1000)-4)))'
    ws.cell(row=i,column=8,value=f'=IF({idx}=0,"",INDEX($D$5:$D$1000,{idx}))').font=Font(name=F,size=10)
    c=ws.cell(row=i,column=9,value=f'=IF({idx}=0,"",INDEX($A$5:$A$1000,{idx}))'); c.font=Font(name=F,size=10); c.number_format='yyyy-mm-dd'
n=5+len(L)+1
ws.cell(row=n,column=2,value='Legend: fill columns A–E only; one row per metric per reading; keep the Metric text identical each time so the Latest block matches it. Numbers only in Value (use 1/0 for yes/no). Add new readings at the bottom — the Latest block reads the last row for each metric. Leave column A to dates only.').font=Font(name=F,size=9,italic=True,color='555555')
ws.merge_cells(start_row=n,start_column=2,end_row=n,end_column=5)
wb.save('designbees-aeo-seo-tracker-2026-09-10.xlsx'); print('saved')
