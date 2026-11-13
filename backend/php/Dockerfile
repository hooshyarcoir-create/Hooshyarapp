FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql
# This container is the shared backend only; Android/Electron keep the UI on-device.
COPY backend/php/api.php /var/www/html/api.php
COPY backend/php/config.example.php /var/www/html/config.php
RUN chown -R www-data:www-data /var/www/html
EXPOSE 80
