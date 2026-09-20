deploy.yml and sync.yml are already in .github\workflows\ (identical copies).
Phase 15 adds ci.yml here: it is .github\workflows\ci.yml plus one step, `npm run test:unit`,
after `npm run check`. Copy it over .github\workflows\ci.yml, then delete this folder.
Claude cannot write under .github from the cloud session.
