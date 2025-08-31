// Hardcoded Gemini API Key (as per your request)
const GEMINI_API_KEY = "AIzaSyCzx6ReMk8ohPJcCjGwHHzu7SvFccJqAbA";
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background script received message:', request.action, 'from sender:', sender); // Debugging line

    // IMPORTANT: Return true to indicate that sendResponse will be called asynchronously.
    const handleAsyncResponse = async () => {
        if (request.action === 'processFormWithAI') {
            try {
                const response = await processFormWithAI(request.fields, request.requirements);
                console.log('Background script: Sending AI processing response:', response);
                sendResponse(response);
            } catch (error) {
                console.error('Background script error (processFormWithAI):', error);
                sendResponse({ success: false, message: `AI processing error: ${error.message}` });
            }
        } else {
            console.warn('Background script: Unknown action received:', request.action);
            sendResponse({ success: false, message: `Unknown action: ${request.action}` });
        }
    };

    handleAsyncResponse(); // Execute the async handler
    return true; // Crucial: Keep the message channel open for the async response
});

async function processFormWithAI(fields, requirements) {
    console.log('Background script: Starting AI processing for fields:', fields, 'with requirements:', requirements);

    const relevantFields = fields.filter(field =>
        field.tagName !== 'button' &&
        field.type !== 'submit' &&
        field.type !== 'reset' &&
        field.type !== 'button' &&
        field.type !== 'hidden' &&
        !field.readOnly &&
        (field.id || field.name)
    );
    console.log('Background script: Relevant fields for AI:', relevantFields);

    const prompt = `
    You are an AI assistant specialized in filling out web forms.
    I will provide you with a list of form fields, including their 'id', 'name', 'type', 'label', 'placeholder', 'tagName', 'currentValue', 'required' status, 'minLength', 'maxLength', 'pattern', and 'options' (for select/radio).
    Your task is to generate appropriate values for each relevant field based on its context, constraints, and the user's requirements.

    Respond ONLY with a JSON object where keys are the 'id' of the field (if available, otherwise 'name') and values are the suggested fill values.
    If you cannot determine a value for a field, omit it from the JSON.
    
    For 'select' fields, provide a 'value' that exactly matches one of its 'options.value' or 'options.text'. Prioritize 'options.value'. If no exact match, try to infer the most suitable option.
    For 'radio' buttons, provide the 'value' attribute of the specific radio option that should be selected.
    For 'checkboxes', provide 'true' or 'false'.
    For 'number' fields, provide a numeric value.
    For 'date', 'email', 'url', 'tel' fields, provide values in the correct format.
    Respect 'required', 'minLength', 'maxLength', and 'pattern' constraints.
    If a field already has a 'currentValue', consider if it should be kept or overridden based on requirements.
    If a field is 'required', try your best to provide a value.

    Example JSON response:
    {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "age": "30",
        "country": "USA",
        "subscribeNewsletter": "true",
        "message": "Hello, I'm interested in your services."
    }

    Here are the form fields to consider:
    ${JSON.stringify(relevantFields, null, 2)}

    Here are the user's requirements:
    "${requirements}"

    Please generate the JSON object:
    `;
    console.log('Background script: Sending prompt to Gemini API.');

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Background script: Gemini API HTTP error:', response.status, errorData);
            throw new Error(`Gemini API error: ${response.status} - ${errorData.error.message || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log('Background script: Raw Gemini API response data:', data);
        const generatedText = data.candidates[0]?.content?.parts[0]?.text;

        if (!generatedText) {
            console.error('Background script: No text generated by Gemini API.');
            throw new Error('No text generated by Gemini API.');
        }
        console.log('Background script: Generated text from Gemini:', generatedText);

        let filledValues;
        try {
            const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                filledValues = JSON.parse(jsonMatch[1]);
            } else {
                filledValues = JSON.parse(generatedText);
            }
            console.log('Background script: Successfully parsed AI response as JSON:', filledValues);
        } catch (jsonError) {
            console.error('Background script: Failed to parse AI response as JSON:', jsonError, 'Raw AI response:', generatedText);
            throw new Error('AI response was not valid JSON. Please try refining your requirements or the prompt.');
        }

        return { success: true, filledValues: filledValues };

    } catch (error) {
        console.error('Background script: Error calling Gemini API:', error);
        return { success: false, message: `Failed to get AI suggestions: ${error.message}` };
    }
}
