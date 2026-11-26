# Dungey

A browser game built with HTML5 canvas and JavaScript. Target: itch.io (static HTML5 upload).

## Run locally

```bash
php -S localhost:${DUNGEY_PORT:-8080}
# or: python3 -m http.server 8080
```

Open http://localhost:8080. ES modules need a server; `file://` will not work.

## Package for itch.io

```bash
zip -r dungey.zip index.html style.css src assets
```

Upload the zip as an HTML project. Keep all asset paths relative.
