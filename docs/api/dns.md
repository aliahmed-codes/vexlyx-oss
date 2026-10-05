# DNS API

DNS record management is part of the Domains API — see `/api/domains/:id/dns*` endpoints in [Domains API](/api/domains).

## CoreDNS

Vexlyx uses **CoreDNS** for authoritative DNS hosting. Zone files are managed via the API and stored in `docker/coredns/zones/`.

To enable public DNS, configure:

```env
VEXLYX_COREFILE=/path/to/Corefile.public
VEXLYX_DNS_BIND=<server-public-ip>
```

See the [DNS Management developer doc](/dev/dns-management) for zone file details, nameserver configuration, and the two DNS modes (CONNECTED vs. MANAGED).
