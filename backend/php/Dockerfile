FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
    && mkdir -p /var/www/html/private /var/www/html/public
COPY webapp/ /var/www/html/public/
COPY backend/php/public/index.php /var/www/html/public/index.php
COPY backend/php/public/.htaccess /var/www/html/public/.htaccess
COPY backend/php/api.php /var/www/html/public/api.php
COPY backend/php/config.example.php /var/www/html/private/config.php
RUN sed -ri 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf \
    && echo 'DirectoryIndex index.php index.html' > /etc/apache2/conf-available/hooshyar-pos.conf \
    && a2enconf hooshyar-pos \
    && chown -R www-data:www-data /var/www/html
ENV HOOSHYAR_CONFIG=/var/www/html/private/config.php
EXPOSE 80
