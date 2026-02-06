import fetch from 'node-fetch';

async function testLinkValidation() {
    const API_URL = 'http://localhost:3001/api/v1/article/update';

    // Sample content with valid and invalid links
    const content = `
# Link Validation Test

Here is a [valid link](https://google.com) that should stay.
Here is an [invalid link](https://this-domain-definitely-does-not-exist-12345.com) that should be removed.
Here is a [broken path](http://localhost:9999/not-found) that should be removed.
  `;

    const payload = {
        article: {
            id: 'test-article-1',
            content: content,
            title: 'Test Article'
        },
        mode: 'validate_links',
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
        console.log('--- Original Content ---');
        console.log(content.trim());
        console.log('--- Cleaned Content ---');
        console.log(data.article.content.trim());

        // Simple assertion
        const cleaned = data.article.content;
        if (cleaned.includes('(https://google.com)') &&
            !cleaned.includes('(https://this-domain-definitely-does-not-exist-12345.com)')) {
            console.log('\n✅ TEST PASSED: Invalid links removed, valid links kept.');
        } else {
            console.log('\n❌ TEST FAILED: Content does not match expectations.');
        }

    } catch (error) {
        console.error('Request failed:', error);
    }
}

testLinkValidation();
