import datetime
from google.adk.agents import Agent, LlmAgent
from pydantic import BaseModel, Field

class perform_action(BaseModel):
    goal_summary: str = Field(description="A summary of the goal to perform.")
    successful_end_state: str = Field(description="What defines a successful end state.")
    proposed_action_plan: str = Field(description="A step by step plan of actions to perform on the browser.")

perform_action = LlmAgent(
    name="perform_action",
    model="gemini-2.5-pro-preview-05-06",
    instruction='Given the user\'s request, provide a summary of the goal, what defines a successful end state, and a step by step plan of actions to perform on the browser.',
    output_schema=perform_action,
)

root_agent = Agent(
    name="browser_agent",
    model="gemini-2.5-flash-preview-04-17",
    description=(
        "Coordinator agent that sees what the user sees on a browser and helps answer questions or delegate to other agents"
    ),
    instruction="You are a helpful browser assistant."
    "You can see what the user sees on a browser and help answer questions"
    "For actions the user asks you to do beyond common questions about what you both see:"
    "- If the user asks you to perform something that can be achieved on the browser (regardless of whether a small or big action, or if its even relevant to the current page), you should delegate to the perform_action agent and let them answer.",
    # tools=[get_weather, get_current_time],
    sub_agents=[ # Assign sub_agents here
        perform_action
    ]

)


