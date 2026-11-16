import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { Link, LinksApiService } from './links-api.service';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly linksApi = inject(LinksApiService);

  readonly links = signal<Link[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly createdLink = signal<Link | null>(null);

  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator],
    }),
  });

  get urlControl(): FormControl<string> {
    return this.form.controls.url;
  }

  ngOnInit(): void {
    this.loadLinks();
  }

  submit(): void {
    this.submitError.set(null);
    this.createdLink.set(null);

    if (this.isSubmitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.linksApi
      .createLink({ url: this.urlControl.value.trim() })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (link) => {
          this.createdLink.set(link);
          this.form.reset({ url: '' });
          this.loadLinks();
        },
        error: (error: unknown) => {
          this.submitError.set(apiErrorMessage(error, 'Could not create the short link.'));
        },
      });
  }

  private loadLinks(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.linksApi
      .getLinks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: (error: unknown) => {
          this.loadError.set(apiErrorMessage(error, 'Could not load links.'));
        },
      });
  }
}

const httpUrlValidator: ValidatorFn = ({ value }): ValidationErrors | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.error;
    if (typeof detail === 'string') {
      return detail;
    }
    if (error.status === 0) {
      return 'Could not reach the Snip API. Make sure the backend is running at http://localhost:3000.';
    }
  }

  return fallback;
}
