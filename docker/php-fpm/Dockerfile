# Vexlyx PHP-FPM (F5.21) — bare php:8.3-fpm-alpine plus the extensions real
# PHP scripts commonly need but the official image doesn't ship: mysqli/
# pdo_mysql (DB access), zip (e.g. a Duplicator migration package extracting
# its own archive), gd/exif (image handling), mbstring/intl (string handling
# most frameworks assume is present). Built once at install time
# (system/scripts/install/steps/10-images.sh) and reused by every no-build
# PHP project's deploy — see system/templates/docker-compose/php-no-build.yml.
FROM php:8.3-fpm-alpine

RUN apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        libzip-dev \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
        icu-dev \
        oniguruma-dev \
    && docker-php-ext-configure gd --with-jpeg --with-freetype \
    && docker-php-ext-install -j"$(nproc)" \
        mysqli \
        pdo_mysql \
        zip \
        gd \
        exif \
        mbstring \
        intl \
    && apk add --no-cache \
        libzip \
        libpng \
        libjpeg-turbo \
        freetype \
        icu-libs \
        oniguruma \
    && apk del .build-deps
