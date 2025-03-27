# how to create an https server certificate

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout private-key.pem -out certificate.pem

## file handling

Create these files locally on your server machine, but
**do not add to your repository** !

## for the future

It is even better to have the keys not materialized as
files at all but maintain and read them from
user-specific environment variables.
