import fetch from 'node-fetch';

async function testHumanizationFix() {
    const API_URL = 'http://localhost:3001/api/v1/article/update';

    // Content with words that will be replaced, potentially causing grammar issues
    // Assuming 'utilize' -> 'use' and 'in order to' -> 'to' are in the replacement list
    // "We utilize this tool in order to improve." -> "We use this tool to improve." (Clean)
    // "The utilization of this..." -> "The use of this..." (Clean)
    // Let's try to construct something that might break or just verify the flow.
    // Since we don't know the exact CSV content, we'll rely on the fact that the AI step runs.

    const content = `
# Humanization Test

We utilize this mechanism in order to facilitate better outcomes. 
However, the utilization of such methods is paramount.
  `;

    const payload = {
        article: {
            id: 'test-humanize-1',
            content: content,
            title: 'Test Humanize'
        },
        mode: 'humanize_text',
        output_mode: 'text_replace_all'
    };

    console.log('Sending request to', API_URL);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error('Error:', response.status, await response.text());
            return;
        }

        const data = await response.json() as any;
        console.log('Success:', data.success);
        console.log('Changes:', data.changes_made);

        if (data.changes_made && data.changes_made.includes('orthography fixed (AI)')) {
            console.log('\n✅ TEST PASSED: AI orthography fix was applied.');
            console.log('--- Final Content ---');
            console.log(data.article.content.trim());
        } else {
            console.log('\n❌ TEST FAILED: AI orthography fix was NOT applied.');
            console.log('Changes:', data.changes_made);
        }

    } catch (error) {
        console.error('Request failed:', error);
    }
}

testHumanizationFix();
