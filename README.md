# OPPAPP — The Opportunity App

**Find your next opportunity. We'll help you get there.**

OPPAPP helps students discover opportunities — research, internships, student teams, volunteering, open source, competitions — understand whether they fit, prepare personalized applications from one reusable profile, and track everything through to follow-up.

Built at **DubHacks '26**.

## The workflow

Student profile → real opportunities → eligibility-aware matching → personalized application preparation → user review → application tracking

## Features

- **Reusable student profile** — import from a résumé (PDF, DOCX, TXT or pasted text), review every extracted field before it's added, or enter details manually. Projects, coursework and volunteering all count as experience.
- **Discovery** — search, category chips, and filters for education level, work arrangement, compensation, skill, deadline, eligibility and listing type.
- **Explainable matching** — interest, stated eligibility, skills, location, deadline and missing information are evaluated separately and explained in plain language. No opaque "fit %".
- **Application workspace** — personalized outreach emails and form answers grounded only in the student's profile, with each field labeled *from profile*, *drafted*, or *needs you*. A readiness checklist flags missing information.
- **Tracker** — statuses, deadlines, follow-up dates and notes. An application is only marked submitted when the student confirms they sent it.
- **Optional Gemini drafting** — bring your own API key (stored only in your browser).

## Trust principles

- Real programs link to their official page; details are summarized and marked "confirm on source". Unknown dates and rules stay marked unknown.
- Demo listings use fictional organizations and are clearly labeled.
- OPPAPP never guesses email addresses, never sends email, and never submits applications.
- All data stays in the browser (localStorage). No account, no server.

## Run it

It's a single static file — open `index.html` in a browser, or serve it with GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

**Demo:** click **Try demo student** on the profile page, open the *Computational Neuroscience* research volunteer listing, click **Prepare Application**, review the draft, and track it in **My Applications**.

## Tech

Vanilla HTML/CSS/JS in one file. pdf.js and mammoth.js load on demand from cdnjs for résumé import. Optional Gemini API for drafting.
