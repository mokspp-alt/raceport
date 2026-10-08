# Выкладка на хостинг

Приложение — статический сайт: сервер и база не нужны, всё считается в браузере.

## 1. Собрать
```bash
cd s14-sim
npm install
npm run build        # результат — папка dist/ (≈ 0.6 МБ: index.html + assets/)
```
Пути в сборке относительные (`base: './'`), поэтому она работает и в корне сайта, и в подпапке, и по IP, и по домену.

## 2. Залить `dist/` на хостинг (любой из способов)

**Панель хостинга / файловый менеджер / FTP** — загрузите **содержимое** `dist/` (не саму папку) в каталог сайта
(`public_html`, `www`, `html` — как называется у вашего хостинга).

**Свой сервер по SSH (VPS)**
```bash
rsync -avz --delete dist/ user@IP_СЕРВЕРА:/var/www/s14-sim/
```
Минимальный nginx (`/etc/nginx/sites-available/s14-sim`):
```nginx
server {
    listen 80;
    server_name _;               # или ваш домен
    root /var/www/s14-sim;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    gzip on;
    gzip_types text/css application/javascript;
}
```
```bash
sudo ln -s /etc/nginx/sites-available/s14-sim /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
После этого приложение открывается по `http://IP_СЕРВЕРА/`.

## 3. Замечания
- HTTPS нужен только если хотите домен с замком: для приложения он не обязателен (WebGL работает и по http).
- Пресеты A/B хранятся в браузере каждого посетителя (localStorage) и не общие.
- Приложение содержит предположения о машине (`src/config/*.ts`) — при публикации стоит заменить их своими данными и пересобрать.
