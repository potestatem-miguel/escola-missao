FROM php:8.2-apache

WORKDIR /var/www/html

RUN a2enmod rewrite headers \
    && sed -i 's/80/8080/g' /etc/apache2/ports.conf

COPY . /var/www/html/
COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/entrypoint.sh /usr/local/bin/estuda-entrypoint.sh

RUN chmod +x /usr/local/bin/estuda-entrypoint.sh \
    && chown -R www-data:www-data /var/www/html

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/estuda-entrypoint.sh"]
CMD ["apache2-foreground"]
