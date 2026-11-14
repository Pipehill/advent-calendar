-- Run once as advent_operator after connecting to the new advent database.
ALTER SCHEMA public OWNER TO advent_app;
REVOKE ALL ON SCHEMA public FROM public;
