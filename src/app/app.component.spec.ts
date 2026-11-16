import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createLoadedComponent() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    return fixture;
  }

  it('rejects empty and non-http(s) URLs without submitting', () => {
    const fixture = createLoadedComponent();
    const app = fixture.componentInstance;

    app.submit();
    expect(app.urlControl.hasError('required')).toBeTrue();
    http.expectNone({ method: 'POST', url: 'http://localhost:3000/api/links' });

    app.urlControl.setValue('ftp://example.com/file');
    app.submit();
    expect(app.urlControl.hasError('httpUrl')).toBeTrue();
    http.expectNone({ method: 'POST', url: 'http://localhost:3000/api/links' });
  });

  it('creates a link and refreshes the links list', () => {
    const fixture = createLoadedComponent();
    const app = fixture.componentInstance;
    const created = {
      code: 'Ab12cd',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/Ab12cd',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    app.urlControl.setValue(created.url);
    app.submit();

    const request = http.expectOne('http://localhost:3000/api/links');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ url: created.url });
    request.flush(created, { status: 201, statusText: 'Created' });
    http.expectOne('http://localhost:3000/api/links').flush([created]);

    expect(app.createdLink()).toEqual(created);
    expect(app.links()).toEqual([created]);
    expect(app.isSubmitting()).toBeFalse();
  });

  it('shows API validation errors inline', () => {
    const fixture = createLoadedComponent();
    const app = fixture.componentInstance;

    app.urlControl.setValue('https://example.com');
    app.submit();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'URL is invalid' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(app.submitError()).toBe('URL is invalid');
    expect(app.isSubmitting()).toBeFalse();
  });
});
