# Project Context

## Producto

Nodaria es una aplicación web generalista para representar visualmente árboles de nodos y las relaciones entre ellos. Combina una jerarquía tipo mapa mental con esquemas configurables, atributos, herencia y relaciones transversales entre nodos.

El producto no está limitado a un sector concreto. Debe poder adaptarse a escritura, investigación, planificación, documentación de sistemas, construcción de mundos y otros problemas que se beneficien de visualizar entidades conectadas.

### Caso de uso de referencia

El caso de uso principal del creador es apoyar la escritura de un libro:

- representar personajes, lugares, organizaciones, acontecimientos o conceptos como nodos;
- describirlos mediante atributos configurables;
- organizar elementos mediante una jerarquía;
- representar relaciones familiares, sociales, narrativas o causales;
- detectar zonas poco desarrolladas de la historia;
- descubrir personajes o conexiones que faltan;
- identificar personajes redundantes o elementos que no aportan a la estructura.

Este caso sirve para validar decisiones de producto y diseñar ejemplos, pero el modelo debe mantenerse generalista. No se deben introducir conceptos narrativos obligatorios en el núcleo del dominio.

## Principios de producto

- El usuario define sus propios tipos de entidad y de relación.
- Los esquemas aportan estructura sin impedir la exploración visual.
- La jerarquía y las relaciones son conceptos distintos: un nodo puede tener un padre en el árbol y, a la vez, múltiples relaciones transversales.
- La visualización debe ayudar a descubrir patrones, huecos, redundancias y puntos de alta conexión.
- Los datos pertenecen al usuario y deben poder exportarse e importarse de forma comprensible.
- La aplicación debe seguir siendo útil sin infraestructura de servidor mientras no exista una necesidad clara de colaboración o sincronización.

## Arquitectura actual

- React 19 y TypeScript en modo estricto.
- Vite como servidor de desarrollo y herramienta de build.
- Estado global mediante Context y reducer en `src/state/AppContext.tsx`.
- Persistencia local mediante `localStorage` en `src/services/storage.ts`.
- Modelo y reglas reutilizables en `src/domain/`.
- Interfaz dividida entre mapa, árbol, inspector, esquemas y layout en `src/components/`.
- Estilos globales en `src/styles/index.css`.

## Modelo de dominio actual

- `Project`: agrupa esquemas, nodos y relaciones.
- `Schema`: define una entidad o una relación, sus atributos, herencia y restricciones.
- `FieldDefinition`: describe un atributo tipado, requerido, calculado o usado como título.
- `Node`: instancia un esquema de entidad y puede pertenecer a un padre jerárquico.
- `Relation`: conecta un nodo de origen con uno de destino e instancia un esquema de relación.

La clave histórica de persistencia es `nodaria_state_v1`. Debe mantenerse mientras sea posible para conservar los proyectos creados con la versión monolítica anterior.

## Estado técnico

- La aplicación monolítica original fue migrada a React, TypeScript y Vite.
- El build y el lint están configurados.
- Todavía no existe una suite de pruebas automatizadas.
- La persistencia sigue siendo exclusivamente local.
- Las selecciones de tipo para crear nodos y relaciones utilizan diálogos nativos temporales; conviene sustituirlos por componentes accesibles propios.

## Prioridades conocidas

- Consolidar la experiencia de creación y edición sin depender de diálogos nativos.
- Mejorar la visualización para mapas grandes: zoom, paneo, disposición y filtros avanzados.
- Añadir validaciones de dominio más completas, especialmente para ciclos de herencia y jerarquía.
- Incorporar pruebas para selectores, migraciones, reducer e importación/exportación.
- Evolucionar la interfaz a partir de casos reales sin acoplar el dominio a la escritura de ficción.
