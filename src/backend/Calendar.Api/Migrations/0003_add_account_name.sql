ALTER TABLE accounts ADD COLUMN name TEXT;

UPDATE accounts SET name = user_name;

ALTER TABLE accounts ALTER COLUMN name SET NOT NULL;

-- Match .NET Unicode whitespace trimming, including non-ASCII spaces.
ALTER TABLE accounts ADD CONSTRAINT accounts_name_valid CHECK (
    char_length(name) BETWEEN 1 AND 100
    AND name = btrim(
        name,
        U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003'
        || U&'\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000'
    )
);
