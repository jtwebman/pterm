# pterm

A cross-platform terminal multiplexer organized around projects. Each project points to a folder, has its own environment variables and configurable commands, and can have multiple terminal sessions running simultaneously.


## Status

**Alpha** — actively under development. See [plan.md](plan.md) for the roadmap.

## Features

- Project-based terminal organization — group terminals by project
- Configurable commands per project (shell, dev server, build, etc.)
- Branch support — run terminals in isolated working directory copies
- Ctrl+wheel font zoom (terminal and sidebar)
- Draggable, resizable sidebar
- Copy/paste keybindings (Ctrl+C/V on Windows/Linux, Cmd+C/V on Mac)
- Busy indicator — see which terminals have running processes
- Persistent settings (font size, sidebar width)

## Development

```
npm install
npm run dev
```

## License

[MIT](LICENSE)
