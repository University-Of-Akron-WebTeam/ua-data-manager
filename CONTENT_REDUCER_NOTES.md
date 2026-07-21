# Content Reducer Notes

UA Content Reducer is a small vanilla JavaScript utility for shortening content that already exists on the page.

## Requirements

- no CLI build
- vanilla JavaScript
- initialized from `UAContentReducer.run(options)` or `UAContentReducer.start(options)`
- reads content from specified elements
- strips HTML from the output
- reduces text to a specified character count
- supports multiple targets, such as carousel items
- can clone, create, or wire "see more" buttons
- buttons can receive a URL from config or from an existing DOM attribute

## Basic Use

```html
<script src="ua-content-reducer.js"></script>
<script>
  UAContentReducer.start({
    targets: ".carousel-item",
    source: ".carousel-copy",
    maxCharacters: 140
  });
</script>
```

`targets` selects each item to process.

`source` selects the content element inside each target. If `source` is omitted, the target itself is reduced.

`maxCharacters` controls the reduced length.

For one standalone content block, use the content element as the target:

```js
UAContentReducer.start({
  targets: ".profile-summary",
  maxCharacters: 140,
  button: {
    mode: "clone",
    source: ".see-more-template"
  }
});
```

## Testimonial Carousel Example

For markup like:

```html
<div id="testimonialCarousel">
  <div class="carousel-item">
    <div class="testimonial-description" data-read-more-url="/testimonials/details?testimonialID=123">
      Long testimonial copy...
    </div>
  </div>
</div>
```

Use:

```js
UAContentReducer.start({
  targets: "#testimonialCarousel .carousel-item",
  source: ".testimonial-description",
  maxCharacters: 160,
  button: {
    mode: "clone",
    source: ".see-more-template",
    className: "arrow-link text-decoration-none"
  }
});
```

When `button.target` is omitted, the button is appended inside the reduced content element after the ellipsis.

If `data-read-more-url` is present on the target, source, output, or a nested element, the button is shown even when the visible text is already shorter than `maxCharacters`. This supports CMS output that has already been shortened server-side.

To place the button in a specific location, add a target outside the content element:

```html
<div class="testimonial-description" data-read-more-url="/testimonials/details?testimonialID=123">
  Long testimonial copy...
</div>
<div class="testimonial-actions"></div>
```

```js
button: {
  mode: "create",
  text: "See more",
  target: ".testimonial-actions",
  urlAttribute: "data-read-more-url",
  className: "arrow-link text-decoration-none"
}
```

## Buttons

Clone an existing button:

```js
UAContentReducer.start({
  targets: ".carousel-item",
  source: ".carousel-copy",
  maxCharacters: 140,
  button: {
    mode: "clone",
    source: ".see-more-template",
    target: ".carousel-actions",
    urlAttribute: "data-url"
  }
});
```

For clone mode, `button.source` can be inside each target or a shared template elsewhere on the page.

When cloning from a hidden template, the reducer removes common hiding classes such as `demo-template`, `d-none`, and `dn`. Use `button.templateClass` if your template uses a custom hiding class that should be removed from the clone.

Create a button:

```js
button: {
  mode: "create",
  text: "See more",
  target: ".carousel-actions",
  url: "https://www.uakron.edu/"
}
```

Wire an existing button inside each target:

```js
button: {
  mode: "wire",
  source: ".see-more",
  urlAttribute: "data-url"
}
```

If a URL is provided, the button links to that URL. If no URL is found, the button expands the reduced text back to the full text.
