# CP Coach (AI Competitive Programming Coach)

CP Coach is a comprehensive, AI-driven competitive programming assistant designed specifically for Codeforces. It analyzes your submission history to scientifically identify your weak topics and seamlessly integrates into your daily practice via a Chrome extension and a beautiful React dashboard.

## Overview

Unlike generic trackers, CP Coach doesn't just look at what you've solved—it analyzes *how* you solve problems. By calculating your "Contest Reliability Rating" for every specific algorithm tag, it mathematically identifies the gaps between your overall rating and your topic-specific performance.

The platform consists of three main components:
1. **FastAPI Backend**: The brain of the operation. It interfaces with the Codeforces API, processes submission histories, and runs the analytics algorithms.
2. **React Dashboard**: A sleek, modern web application that visualizes your statistics, highlights your weaknesses, and provides AI-curated upsolve recommendations.
3. **Chrome Extension**: A Manifest V3 browser extension that quietly sits in the background and injects colored badges directly onto the Codeforces problemset table, instantly warning you if a problem contains a topic you are weak at.

---

## How It Works: The Logic

### 1. Identifying Weak Topics
The backend fetches your entire Codeforces submission history and groups problems by their tags (e.g., `math`, `greedy`, `dynamic programming`). For each tag, it calculates a **Contest Reliability Rating**. 

We compare this tag-specific rating against your actual overall Codeforces rating to find the "Gap".
- **Confirmed Weak**: If your rating for a specific tag is more than **75 points** lower than your overall rating, it is flagged as a confirmed weakness.
- **Avoided**: If you frequently skip problems of a certain tag during contests, or have an unusually high failure rate without eventually getting an AC (Accepted), the topic is flagged as "Avoided".

*Note: To prevent noise, the extension only badges your **Top 3 most critical** weak topics. If you are weak at 15 things, we force you to focus on the 3 most important ones first.*

### 2. Multi-Armed Bandit Recommendations
When the dashboard recommends problems for you to upsolve, it doesn't just pick randomly. It uses a **Multi-Armed Bandit (MAB)** algorithm. This algorithm balances:
- **Exploitation**: Giving you problems from your "Confirmed Weak" or "Avoided" topics to force you to patch your gaps.
- **Exploration**: Occasionally giving you problems from "Strong" or "Average" topics slightly above your rating to push your boundaries and ensure you don't stagnate.

---

## Chrome Extension Integration

The Chrome extension acts as your in-context coach.
1. **Auto-Handle Capture**: When you open Codeforces, the extension quietly scrapes your username from the navigation bar.
2. **Badge Injection**: When you browse `/problemset` or `/contest/*/problems`, the extension asks the local backend for your top 3 weakest topics. It then scans the problem tags on the page. If a problem falls into one of your weak topics, it injects a vibrant red/orange dot next to the problem name.
3. **Tooltips**: Hovering over the dot reveals exactly why it was flagged (e.g., `Weak Topic: greedy`).
4. **Seamless Dashboard Bridge**: Clicking "Open Dashboard" from the extension popup instantly launches the React app and automatically passes your handle via the URL so you don't have to log in twice.

---

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Recharts, Lucide Icons.
- **Backend**: Python, FastAPI, Uvicorn, httpx (for Codeforces API async requests).
- **Extension**: Chrome Manifest V3, Vanilla JavaScript, CSS.

---

## Local Setup

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend (Dashboard)
```bash
cd frontend
npm install
npm run dev
```

### 3. Chrome Extension (Developer Mode)
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `extension` folder in this repository.

---

## Deploying & Sharing with Friends

Because the backend is configured for cloud deployment (via Render) and the frontend for Vercel, you can easily share this with your friends!

### Installing the Cloud-Connected Extension
If you have downloaded or received the `cp-coach-extension.zip` file:
1. Extract/unzip the file into a folder.
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extracted folder.
5. Pin the extension and click it! It is pre-configured to talk to the live cloud backend, so it works 24/7 without you needing to run any code locally.

---

## Roadmap
- [x] Codeforces API Integration
- [x] Tag-based Contest Reliability Rating algorithm
- [x] Multi-Armed Bandit Recommendations
- [x] Chrome Extension DOM injection
- [ ] LeetCode / AtCoder integration
- [ ] True AI Chatbot Integration for personalized coaching (Under Construction)
