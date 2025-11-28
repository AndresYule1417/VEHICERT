# Mockups UI VEHICERT

## Objetivo
Estos mockups representan las pantallas iniciales (inicio/login) y el flujo de registro / validación ampliado de VEHICERT. Sirven como guía visual y funcional preliminar antes de la integración con backend, chatbot y fuentes externas (RUNT, SIMIT, aseguradoras, etc.).

## Estructura
```
mockups/
  inicio-login/
    index.html
    styles.css
    app.js
  registro-validacion/
    index.html
    styles.css
    app.js
  README.md  ← Este archivo
```

- `inicio-login/`: Variantes de la pantalla de acceso con imagen de fondo, overlay, roles y chips de acciones.
- `registro-validacion/`: Flujo multi-paso (wizard) para captura de datos del vehículo, propietarios, mantenimientos, documentos, firma digital, geolocalización y cálculo preliminar de un VEHI-Score.

## Tecnologías
- HTML5 semántico (estructura básica y contenedores de pasos).
- CSS con variables (paleta corporativa, degradados y overlays para contraste).
- JavaScript Vanilla: control de pasos, firmas en canvas, simulación geolocalización, cálculo heurístico de score.
- Sin dependencias externas (no frameworks) para facilitar revisión rápida.

## Cómo usar
1. Abrir cada `index.html` directamente en el navegador para ver la interfaz estática.
2. Para evitar restricciones de rutas en algunos navegadores, opcionalmente servir con un servidor local sencillo (ej: `npx serve` o `python -m http.server`).
3. Interactuar con los pasos del wizard para observar la lógica básica de avance y validaciones superficiales.

## Accesibilidad (Pendiente)
- Se incluyen algunos atributos ARIA básicos.
- Mejoras futuras: foco gestionado al cambiar de paso, navegación completa con teclado, avisos para lectores de pantalla en cambios de estado.

## Alcances y Limitaciones
- No hay persistencia real ni integración de API.
- Los cálculos de puntajes y validaciones son demostrativos.
- La firma digital y geolocalización están simuladas/locales.

## Próximos Pasos Propuestos
- Integrar backend / servicios externos para validación real de datos.
- Refinar accesibilidad y pruebas de contraste.
- Añadir tests unitarios para lógica crítica del wizard.
- Optimizar carga de imágenes y revisión de performance CSS.

## Relación con el Chatbot
El repositorio original contiene el chatbot; estos mockups son complementarios y no alteran su lógica. Se mantienen en carpeta separada para evitar interferencias.

## Licencia / Uso
Prototipos internos de VEHICERT S.A.S. destinados a exploración de UX/UI. No se recomienda despliegue productivo sin endurecimiento de seguridad y validaciones.

---
Si necesitas más detalles de cada paso o deseas agregar documentación de flujo, se puede extender esta sección.
