# Developer Notes

These notes describe how UA Data Manager plugins are expected to work.

## Plugin Flow

1. A page loads `ua-data-manager.js`.
2. A plugin file loads and registers itself with:

```js
UADataManager.registerPlugin("pluginName", createPlugin);
```

3. The page calls `UADataManager.init(...)`.
4. The core loads and parses data.
5. The core creates each configured plugin and passes it a shared `context`.
6. Each plugin runs `init()`.
7. After all plugin init work finishes, the core calls `render()`.
8. Plugin events update plugin state and call `context.manager.render()` to redraw.

## Context Helpers

Plugins receive a `context` object from the core. Common helpers are:

- `context.records()` gets the current record array.
- `context.loadTemplate(options)` loads `template` or `templateurl`.
- `context.resolveElement(selectorOrElement)` finds the plugin stage.
- `context.escapeHtml(value)` escapes data values for string rendering.
- `context.listen(root, eventName, selector, handler)` binds delegated events.
- `context.paging` exposes shared paging math and control metadata.
- `context.elementBuilder` builds common form/media elements.

## Template-First Pattern

New plugins should keep page HTML in an HTML template file.

The preferred pattern is:

1. Load the template in `init()`.
2. Mount the template shell into the stage.
3. Keep repeatable item markup in a nested `<template>` element.
4. Clone repeatable template nodes in `render()`.
5. Replace `{{field}}` values in cloned nodes and attributes.
6. Update named DOM targets such as `[data-ua-example-value]`.
7. Keep `render()` focused on data prep and helper calls.

Avoid building page markup strings inside `render()`. Small state updates, labels, attributes, and text values are fine.

## Plugin File Shape

A plugin file should usually have:

- `defaults`
- `createPlugin(context, options)`
- constructor or instance factory
- `init()`
- `render()`
- event binding methods
- template utility methods
- plugin-specific data preparation
- registration block at the bottom

Use `plugins/starter.js` as a copyable shell for new plugins.

## Template Conventions

Prefer stable data attributes over brittle selectors:

```html
<div data-ua-example>
  <span data-ua-example-value="count"></span>
  <div data-ua-example-items>
    <template data-ua-example-item-template>
      <article data-ua-example-item>{{title}}</article>
    </template>
  </div>
</div>
```

Use plugin-specific prefixes so multiple plugins can exist on the same page without selector collisions.

## Registration

Plugins should support either script load order:

```js
if (global.UADataManager && typeof global.UADataManager.registerPlugin === "function") {
  global.UADataManager.registerPlugin("starter", createStarterPlugin);
} else {
  global.UADataManagerPendingPlugins = global.UADataManagerPendingPlugins || [];
  global.UADataManagerPendingPlugins.push({
    name: "starter",
    factory: createStarterPlugin
  });
}
```

The final global export is optional but useful for debugging and late registration:

```js
global.UADataManagerStarterPlugin = createStarterPlugin;
```

## Naming Notes

Avoid naming a copyable plugin shell `template.js`, because this project already uses HTML templates. Use names such as `starter.js`, `example.js`, or the actual plugin name.
