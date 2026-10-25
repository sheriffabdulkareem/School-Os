# SchoolOS — Full-Stack Version

SchoolOS is now connected to a real backend and SQLite database.

## Stack
- HTML/CSS/Bootstrap frontend
- Vanilla JavaScript API client
- Node.js HTTP backend
- SQLite database using Node 22's built-in `node:sqlite`
- Password hashing with Node `crypto.scrypt`
- Cookie-based server sessions

## Implemented
- School/admin registration
- Login/logout + protected dashboard
- Multi-school data isolation
- Add/delete students
- Add/delete teachers
- Daily attendance (present/absent/late)
- Fee payment records + generated references
- Live dashboard statistics
- Recent payment list

## Run
1. Install Node.js 22.5+
2. Run `npm start` (no npm package installation is required)
4. Open `http://localhost:3000`

A `data/schoolos.db` file is created automatically on first run.

## API flow
`register.html` → `POST /api/auth/register` → SQLite → session cookie → `dashboard.html`

`login.html` → `POST /api/auth/login` → database verification → session cookie → dashboard

Dashboard actions follow the same pattern: frontend form → API request → backend validation → database → JSON response → UI update.

## Next modules
Results/grades, timetable, parent accounts, notifications, role-based teacher accounts, receipts/PDFs, backups, audit logs and deployment can be added on top of this foundation.
