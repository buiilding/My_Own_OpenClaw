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


# Specific TODOs
- [ ] PyAutoGUI takes screen resolutions from the backend, make it accept the frontend screen size.
- [ ] fix the ocr for screen resolution that is not (1920x1080)
- [ ] Create a way so devs can select the tools given to the agent, so there are only tool schemas given to the agent based on the selected tools. this way, we can test each functionalities individually, namely browser-control, computer-control, coding.
- [ ] fully test browser-control workfflow, perfect tools.
- [ ] fully test coding capabilities workflow, perfect tools.
- [ ] make the ui click-through so it doesnt interfere with the main window, better the ui.
