FROM alpine:3.20

# Install Postfix, OpenDKIM, OpenSSL, and utilities
RUN apk add --no-cache \
    postfix \
    opendkim \
    opendkim-utils \
    openssl \
    ca-certificates \
    cyrus-sasl \
    bash

# Create required directories
RUN mkdir -p /etc/postfix /etc/opendkim /var/spool/postfix /var/run/opendkim /var/log/postfix

# Copy configurations
COPY main.cf /etc/postfix/main.cf
COPY master.cf /etc/postfix/master.cf
# Outside /etc/opendkim: that directory is a bind mount of runtime state
COPY opendkim.conf /etc/opendkim.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY healthcheck.sh /usr/local/bin/healthcheck.sh

RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.sh && \
    chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.sh

# Expose SMTP (25) and Submission (587)
EXPOSE 25 587 8891

# A long start period covers the first boot (certificate and map generation)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["/usr/local/bin/healthcheck.sh"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
