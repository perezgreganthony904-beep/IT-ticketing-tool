import { useState } from 'react';

const categories = ['Hardware', 'Software', 'Network', 'Account'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];

export default function CustomerRequest() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setError(false);
    setMessage('');
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        title: String(values.get('title')).trim(),
        description: String(values.get('description') || '').trim(),
        requester: String(values.get('requester')).trim(),
        email: String(values.get('email')).trim(),
        category: String(values.get('category')),
        priority: String(values.get('priority'))
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not submit your request. Please try again later.');
      form.reset();
      setSubmitted(true);
      setMessage('Your request has been sent to the IT team. They can follow up using the email address you provided.');
    } catch {
      setError(true);
      setMessage('Could not submit your request. Please try again later or contact your IT team directly.');
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="auth-screen" aria-labelledby="request-title">
    <div className="auth-card customer-request-card">
      <a className="brand auth-brand" href="/" aria-label="Fieldnote staff sign-in"><span className="brand-mark">F</span><span>fieldnote<span className="brand-dot">.</span><small>IT SERVICE DESK</small></span></a>
      {submitted ? <>
        <div className="eyebrow">REQUEST RECEIVED</div>
        <h1 id="request-title">Thanks for letting us know.</h1>
        <p className="auth-copy">{message}</p>
        <button className="button button-dark auth-submit" type="button" onClick={() => { setSubmitted(false); setMessage(''); }}>Submit another request</button>
      </> : <>
        <div className="eyebrow">CUSTOMER & EMPLOYEE SUPPORT</div>
        <h1 id="request-title">What can we help with?</h1>
        <p className="auth-copy">Send a request to the IT team. You don’t need an account to submit this form.</p>
        <form className="auth-form customer-request-form" onSubmit={submitRequest}>
          <label className="field">Your name<input name="requester" required maxLength="80" autoComplete="name" placeholder="Full name" /></label>
          <label className="field">Work email<input name="email" type="email" required maxLength="120" autoComplete="email" placeholder="you@company.com" /></label>
          <label className="field">Issue summary<input name="title" required maxLength="100" placeholder="What do you need help with?" /></label>
          <label className="field">Details<textarea name="description" rows="4" maxLength="500" placeholder="Include any error messages or steps already tried." /></label>
          <div className="customer-request-options">
            <label className="field">Category<select name="category" defaultValue="Hardware">{categories.map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="field">Priority<select name="priority" defaultValue="Medium">{priorities.map(item => <option key={item}>{item}</option>)}</select></label>
          </div>
          <button className="button button-dark auth-submit" type="submit" disabled={submitting}>{submitting ? 'Sending request…' : <>Submit request <span className="button-arrow">↗</span></>}</button>
        </form>
      </>}
      <p className={`auth-message ${error ? 'error' : ''}`} role="status" aria-live="polite">{!submitted ? message : ''}</p>
      <a className="auth-link" href="/">IT team sign in</a>
    </div>
    <div className="auth-footer">FIELDNOTE <span>·</span> IT SUPPORT REQUESTS</div>
  </section>;
}