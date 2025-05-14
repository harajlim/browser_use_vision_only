import datetime
from google.adk.agents import Agent, LlmAgent
from pydantic import BaseModel, Field

class url(BaseModel):
    url: str = Field(description="The url to navigate to.")

model="gemini-2.5-pro-preview-05-06"
# model="gemini-2.5-flash-preview-04-17"

navigate_agent = LlmAgent(
    name="navigate_agent",
    model=model,
    instruction="respond with the url to navigate to ONLY. Do not include any other text.",
    output_schema=url,
)

class click_bounding_box(BaseModel):
    item_description: str = Field(description="A description of the item to click on.")
    xmin: int = Field(description="The xmin of the bounding box.")
    ymin: int = Field(description="The ymin of the bounding box.")
    xmax: int = Field(description="The xmax of the bounding box.")
    ymax: int = Field(description="The ymax of the bounding box.")

click_agent = LlmAgent(
    name="click_agent",
    model=model,
    instruction="respond with a description of the item to click along with its bounding box. Do not include any other text. Bounding box is normalized to 0-1000.",
    output_schema=click_bounding_box,
)

class fill_form(BaseModel):
    field_name: str = Field(description="The name of the field to fill in.")
    field_value: str = Field(description="The value to fill in the field with.")
    xmin: int = Field(description="The xmin of the bounding box.")
    ymin: int = Field(description="The ymin of the bounding box.")
    xmax: int = Field(description="The xmax of the bounding box.")
    ymax: int = Field(description="The ymax of the bounding box.")

fill_agent = LlmAgent(
    name="fill_agent",
    model=model,
    instruction="Fill in the given form on the current page. Respond with the field name, field value, and the bounding box of the field ONLY. Do not include any other text. Bounding box is normalized to 0-1000.",
    output_schema=fill_form,
)

class scroll_direction(BaseModel):
    relative_amount: float = Field(description="The relative -to the current viewport height - amount to scroll in a given direction. Positive values scroll down, negative values scroll up.")

scroll_agent = LlmAgent(
    name="scroll_agent",
    model=model,
    instruction="Scroll up or down on the current page. Respond with the relative amount to scroll in ONLY. Do not include any other text.",
    output_schema=scroll_direction,
)

class information_gather(BaseModel):
    information: str = Field(description="The information gatheredfrom the current page.")

information_gather_agent = LlmAgent(
    name="information_gather_agent",
    model=model,
    instruction="Gather information from the current page relevant to the goal. Respond with the information gathered ONLY. Do not include any other text. Make sure the gathered information is well structured and easy to understand.",
    output_schema=information_gather,
)

class concluding(BaseModel):
    concluding: str = Field(description="The concluding statement to provide the user with.")

concluding_agent = LlmAgent(
    name="concluding_agent",
    model=model,
    instruction="Conclude the whole process by providing the user with the information they need or communicating that the goal has been reached or the errors encountered. Make use of previously gathered information as needed.",
    output_schema=concluding,
)


root_agent = Agent(
    name="browser_controller",
    model=model,
    description=(
        "Agent that performs actions on the browser."
    ),
    instruction="You're helping the user perform actions on the browser."
    "The user will provide you with a broad goal they're trying to achieve; proposed steps to achieve the goal, and what defines a successful end state."
    "You'll get the current state of the browser, along with the history of actions that have been performed."
    "Based on the above; you will delegate to the appropriate agent to perform the next action. You should never perform the action yourself, always delegate."
    "Agents you can delegate to are:"
    "1- navigate_agent: navigates to a specific url"
    "2- click_agent: clicks on an element on the current page"
    "3- fill_agent: fills in a form on the current page"
    "4- scroll_agent: scrolls up or down on the current page"
    "5- information_gather_agent: gathers information from the current page relevant to the goal"
    "6- concluding_agent: If you feel the goal has been reached; or progress has stallled, you should delegate to the concluding_agent to wrap up the process."
    "If we've performed more than 20 actions, you should just delegate to the concluding_agent to wrap up the process."
    "Always evaluate to make sure previous steps have been successful before proceeding to the next step. If they're not successful, you should try to either repeat a similar action or find a new way to achieve the goal."
    "A lot of the times; one of your delegates likely gave a bad bounding box for example.",

    # tools=[get_weather, get_current_time],
    sub_agents=[ # Assign sub_agents here
        navigate_agent,
        click_agent,
        fill_agent,
        scroll_agent,
        information_gather_agent,
        concluding_agent
    ],
)


