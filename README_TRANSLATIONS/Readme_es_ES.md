> [!CAUTION]
> Airlink sigue en desarrollo por un tiempo y está siendo utilizada por algunas personas, espere a una versión de lanzamiento.

# Airlink Panel 🚀

**Sistema de manejon de servidores aerodinámico**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
  
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/D8YbT9rDqz)

## 📖 Visión general

Airlink panel es una plataforma avanzada de administración de servidores de juegos de código abierto diseñada para simplificar la implementación, el monitoreo y la administración del servidor.
## 🛠 Prerequisitos

- Node.js (v16+)
- npm (v8+)
- Git
- Base de datos soportada (PostgreSQL/MySQL)

## 💾 Instalación

1. Clonar el repositorio:
   ```bash
   cd /var/www/
   git clone https://github.com/AirlinkLabs/panel.git
   cd panel
   ```

2. Configurar los permisos 755 en el directorio del panel:
   ```bash
   sudo chown -R www-data:www-data /var/www/panel
   sudo chmod -R 755 /var/www/panel
   ```

3. Instalar dependencias:
   ```bash
    npm install -g typescript
    npm install --production
   ```

4. Configurar la base de datos Prisma y ejecutar migraciones:
   ```bash
   npm run migrate:dev
   ```

5. Desplegar la aplicación:
   ```bash
   npm run build-ts
   ```

6. Ejecutar la aplicación:
   ```bash
   npm run start
   ```

## Ejecutar con pm2 (Opcional)

1. Instalar pm2:
   ```bash
   npm install pm2 -g
   ```

2. Iniciar la aplicación usando pm2:
   ```bash
   pm2 start dist/app.js --name "panel"
   ```

3. Configurar pm2 para iniciar automaticamente en el inicio del servidor:
   ```bash
   pm2 save
   pm2 startup
   ```

## 🤝 Contribución

1. Bifurcar el repositorio
2. Crear tu rama (`git checkout -b feature/AmazingFeature`)
3. Confirmar los cambios (`git commit -m 'Add some AmazingFeature'`)
4. Guardar los cambios (`git push origin feature/AmazingFeature`)
5. Abrir una solicitud de cambios

### Guias de contribución

- Seguir las mejores prácticas de typescript
- Escribir test unitarios para las nuevas características
- Mantener un codigo limpio y leible
- Actualizar la documentación

## 📄 License

Distribuido bajo la licencia MIT. See `LICENSE` para mas información.

<div align="center">
  Hecho con ❤️ por AirLink Labs
</div>
