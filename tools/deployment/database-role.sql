-- Run once as advent_operator in the postgres maintenance database.
-- A new role has no usable password until the operator runs psql's password prompt.
-- Do not place a password in this template or a command-line argument.
CREATE ROLE advent_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE DATABASE advent OWNER advent_app;

REVOKE ALL ON DATABASE advent FROM public;
REVOKE ALL ON DATABASE postgres FROM public;
REVOKE ALL ON DATABASE template1 FROM public;
