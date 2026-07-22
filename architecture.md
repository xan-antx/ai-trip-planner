The "Keep It Real" AI Trip Planner Architecture
1. Drop the Complex Vector Databases (RAG)

Do not attempt to build a Retrieval-Augmented Generation (RAG) system using pgvector for PostgreSQL.
Maintaining a separate Vector database is too complex and unnecessary for the scope of this project.
If you cannot successfully connect to a live travel company API (like MakeMyTrip), simply fall back to calling the Gemini API directly.
As your friend pointed out, interviewers will not expect a second-year student to have a production-grade RAG system; they just want to see a working full-stack application.

Keep the Scope Limited and Hardcoded

Start by forcing the user to sign up and log in.
This simple authentication step is crucial because it easily proves to the interviewer that you know how to handle and update a database.
Hardcode exactly three starting locations in your database rather than trying to map the whole world.
Your friend suggested Jaipur, Mumbai, and a placeholder "ABC". To make this uniquely yours and easier to test, you could swap "ABC" with regional routes you know well, like Chandigarh or Patiala.

The Dual-UI Approach

Store the top 7 tourist locations for each of your three hardcoded cities directly in your PostgreSQL database.
When a user clicks on a city (e.g., Jaipur), the frontend should immediately query your database and display those top tourist locations.
Alongside this static data, include a text-based chatbot interface.

The AI Chatbot Workflow

When the user asks the chatbot a specific question (e.g., "Food places near Hawa Mahal"), the backend should first query your PostgreSQL database for tokens or keywords related to "Hawa Mahal".
Extract that relevant information from your database and append it as "context" to the user's prompt.
Send this combined prompt (User Question + Database Context) to the Gemini API so it can generate a highly accurate, customized response.
If the user asks for something outside your database (like "I want to eat vegan"), the Gemini API will seamlessly handle it using its own pre-trained knowledge since that data won't exist in your DB.
The MCP Architecture 1. The Backend Client: You will configure an MCP Client inside your Node.js/Express server. 2. The MCP Server: You will connect your Node.js client to an existing MakeMyTrip MCP Server. 3. The AI Agent Flow: When a user asks your React frontend, "Find a hotel in Jaipur," your Node.js server passes that prompt to the Gemini API. Gemini recognizes it needs live data, automatically calls the MakeMyTrip MCP server to get the real-time prices, and then formats a perfect response to send back to the user.