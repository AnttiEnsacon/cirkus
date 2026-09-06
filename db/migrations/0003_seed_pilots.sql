-- Seeds the 8 real, already-known KML Aviation Oy pilots as pre-approved
-- accounts (they are not new signups going through the approval flow).
-- Emails are placeholders (firstname.lastname@kmlaviation.fi) until real
-- addresses are supplied — editable later from Manage -> Accounts.
-- No password_hash is set: an admin sets each person's first password by
-- hand from Manage -> Accounts (see build plan: password resets are
-- admin-handled in MVP).
insert into users (name, email, role, status) values
	('Kari Häkkinen', 'kari.hakkinen@kmlaviation.fi', 'admin', 'approved'),
	('Antti Hänninen', 'antti.hanninen@kmlaviation.fi', 'admin', 'approved'),
	('Siegfried Schobesberger', 'siegfried.schobesberger@kmlaviation.fi', 'pilot', 'approved'),
	('Mauri Hälinen', 'mauri.halinen@kmlaviation.fi', 'pilot', 'approved'),
	('Heikki Jouppila', 'heikki.jouppila@kmlaviation.fi', 'pilot', 'approved'),
	('Juha Valkonen', 'juha.valkonen@kmlaviation.fi', 'pilot', 'approved'),
	('Seppo Ylä-Herttuala', 'seppo.yla-herttuala@kmlaviation.fi', 'pilot', 'approved'),
	('Jari Tapaninen', 'jari.tapaninen@kmlaviation.fi', 'pilot', 'approved')
on conflict (email) do nothing;
