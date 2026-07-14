# Grid Developer Notes

These notes describe the recommended pattern for table-like UA Data Manager plugins.

## When To Use A Grid Plugin

Use a grid-style plugin when the feature needs:

- columns
- sorting
- text/select/checkbox filters
- result counts
- paging or infinite scroll
- a table-like template owned by HTML

Use `plugins/grid-starter.js` when building a new grid-like feature plugin. The existing `plugins/grid.js` is a full course-grid implementation; the starter is intentionally smaller and easier to copy.

## Grid Flow

1. `init()` loads the HTML template.
2. The plugin mounts the template shell into `stage`.
3. The plugin renders filter controls into named filter targets.
4. `render()` gets records from `context.records()`.
5. Records are normalized for the feature, if needed.
6. Active filters are applied.
7. Active sorting is applied.
8. Paging is applied.
9. Column labels, counts, and rows are replaced in the mounted template.
10. Infinite scrolling watches a marker inside the grid scroll container.
11. Events update plugin state and call `context.manager.render()`.

## Template Shape

Keep the grid HTML in a template file. A grid template should usually include:

```html
<section data-ua-grid-starter>
  <div data-ua-grid-starter-filter-target="keyword"></div>
  <div data-ua-grid-starter-value="shown"></div>
  <div data-ua-grid-starter-value="count"></div>

  <div class="example-grid-scroll" data-ua-grid-starter-scroll>
    <table>
      <thead>
        <tr>
          <th data-ua-grid-starter-column="1">
            <button type="button" data-ua-grid-starter-sort="">
              <span data-ua-grid-starter-column-label></span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody data-ua-grid-starter-rows>
        <template data-ua-grid-starter-row-template>
          <tr>
            <td>{{title}}</td>
          </tr>
        </template>
      </tbody>
    </table>

    <div data-ua-grid-starter-infinite-marker aria-hidden="true"></div>
  </div>
</section>
```

The plugin owns data behavior. The template owns markup, layout, and CSS.

For infinite scroll, the marker must be inside the scroll container. The starter looks for `[data-ua-grid-starter-scroll]` and uses that element as the `IntersectionObserver` root.

```css
.example-grid-scroll {
  max-height: 68vh;
  overflow: auto;
}
```

## Options

```js
"grid-starter": {
  stage: "#stage",
  templateurl: "templates/example-grid.html",
  columns: [
    { key: "title", label: "Title", target: "title" },
    { key: "department", label: "Department", target: "department" }
  ],
  filters: {
    keyword: {
      type: "text",
      label: "Search",
      target: ["title", "department"]
    },
    department: {
      type: "checkbox-group",
      label: "Department",
      target: "department"
    }
  },
  paging: {
    type: "infinite",
    page: 1,
    pageSize: 50
  }
}
```

## Event Rules

Filters and sort buttons should use delegated events from the plugin stage. On filter or sort changes:

- update plugin state
- reset `state.page` to `1`
- call `context.manager.render()`

Avoid replacing filter controls on every render. Replacing an input while the user is typing causes focus loss.

For infinite scroll, keep the scroll marker inside the grid container, not at the bottom of the page. This makes large result sets scroll inside the grid area and keeps the rest of the page stable.

## Copy Checklist

When copying `grid-starter.js`:

- rename the plugin key
- rename constructor and exported global
- rename all `data-ua-grid-starter-*` attributes
- update default columns and filters
- add feature-specific record normalization
- keep row markup in the HTML template
- keep `render()` focused on data flow
