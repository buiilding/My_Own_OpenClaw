# High-Level TODOs

- [ ] Scale OCR and vision-grounding model instances to serve multiple users dynamically.
- [ ] Separate system prompts for computer-use models vs. non-computer-use models.
- [ ] Enable WindieOS to evolve itself (frontend implementations, self-improvement).
- [ ] Allow the agent to interact with its own UI (e.g., add `skills.md`).
- [ ] Automate remote tool schema updates in the backend.
- [ ] Add authentication flows (login/signup).
- [ ] Build landing page.
- [ ] Chat mode: capture screenshot and open dashboard immediately (student-facing).
- [ ] Explore dedicated VM for Windie (user-controllable and agent-controllable); consider off-device hosting vs. security.
- [ ] Create an OS specifically for an agent.
- [ ] Create usage limits for users so we don't go broke


# Specific TODOs
- [ ] PyAutoGUI takes screen resolutions from the backend, make it accept the frontend screen size.
- [ ] fix the ocr for screen resolution that is not (1920x1080)
- [ ] Create a way so devs can select the tools given to the agent, so there are only tool schemas given to the agent based on the selected tools. this way, we can test each functionalities individually, namely browser-control, computer-control, coding.
- [ ] fully test browser-control workfflow, perfect tools.
- [ ] fully test coding capabilities workflow, perfect tools.
- [x] make the ui click-through so it doesnt interfere with the main window, better the ui.

## 02/22/2026

- [ ] Fix the UI in macos, to make the pills go everywhere on wherever the window the user goes to. (active. Pranav)
- [x] Find a way to show thinking in the UI when the model thinks (ex. Kimi code)
- [ ] Package the UI so users can download
- [ ] have browser-use have only one seperate instance and one connect method, this instance has to be persistent across sessions too so users can save credentials in there.
- [ ] Create new UI for optimial user experience (active. Peter)
- [ ] Create new, adaptive system prompt.
