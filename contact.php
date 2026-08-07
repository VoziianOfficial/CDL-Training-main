<?php

declare(strict_types=1);

const MAX_REQUEST_BYTES = 65536;
const RATE_LIMIT_REQUESTS = 6;
const RATE_LIMIT_WINDOW_SECONDS = 300;

$formDefinitions = [
    'quick_request' => [
        'subject' => 'Quick CDL Information Request',
        'required' => [
            'fullName',
            'email',
            'program',
            'consent',
        ],
    ],
    'contact' => [
        'subject' => 'CDL Program Information Request',
        'required' => [
            'fullName',
            'email',
            'program',
            'message',
            'consent',
        ],
    ],
    'schedule_inquiry' => [
        'subject' => 'CDL Training Schedule Inquiry',
        'required' => [
            'fullName',
            'email',
            'program',
            'trainingFormat',
            'consent',
        ],
    ],
    'advertise_collaborate' => [
        'subject' => 'Advertising and Collaboration Inquiry',
        'required' => [
            'fullName',
            'email',
            'collaborationType',
            'goals',
            'consent',
        ],
    ],
    'service_cdl_class_a' => [
        'subject' => 'Class A CDL Program Inquiry',
        'required' => [
            'fullName',
            'email',
            'message',
            'consent',
        ],
    ],
    'service_cdl_class_b' => [
        'subject' => 'Class B CDL Program Inquiry',
        'required' => [
            'fullName',
            'email',
            'message',
            'consent',
        ],
    ],
    'service_behind_the_wheel' => [
        'subject' => 'Behind-the-Wheel Training Inquiry',
        'required' => [
            'fullName',
            'email',
            'message',
            'consent',
        ],
    ],
    'service_job_placement' => [
        'subject' => 'CDL Career Support Inquiry',
        'required' => [
            'fullName',
            'email',
            'message',
            'consent',
        ],
    ],
    'service_financial_aid' => [
        'subject' => 'CDL Financial Aid Inquiry',
        'required' => [
            'fullName',
            'email',
            'assistanceType',
            'message',
            'consent',
        ],
    ],
    'service_company_sponsorships' => [
        'subject' => 'Company-Sponsored CDL Training Inquiry',
        'required' => [
            'fullName',
            'email',
            'message',
            'consent',
        ],
    ],
];

$fieldLabels = [
    'formType' => 'Form Type',
    'fullName' => 'Full Name',
    'email' => 'Email Address',
    'program' => 'Program',
    'trainingProgram' => 'Training Program',
    'licenseStatus' => 'Current License Status',
    'trainingFormat' => 'Preferred Training Format',
    'startPeriod' => 'Preferred Start Period',
    'careerDirection' => 'Preferred Career Direction',
    'collaborationType' => 'Collaboration Type',
    'assistanceType' => 'Assistance Information Needed',
    'message' => 'Message',
    'goals' => 'Goals and Project Context',
    'consent' => 'Consent',
    'sourcePage' => 'Source Page',
];

$fieldLimits = [
    'formType' => 80,
    'fullName' => 120,
    'email' => 254,
    'program' => 120,
    'trainingProgram' => 120,
    'licenseStatus' => 120,
    'trainingFormat' => 120,
    'startPeriod' => 120,
    'careerDirection' => 120,
    'collaborationType' => 120,
    'assistanceType' => 120,
    'message' => 5000,
    'goals' => 5000,
    'consent' => 20,
    'sourcePage' => 1000,
];

function clientWantsJson(): bool
{
    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    $requestedWith = strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
    $fetchMode = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_MODE'] ?? ''));

    if (str_contains($accept, 'application/json')) {
        return true;
    }

    if (str_contains($contentType, 'application/json')) {
        return true;
    }

    if ($requestedWith === 'xmlhttprequest') {
        return true;
    }

    if ($fetchMode !== '' && $fetchMode !== 'navigate') {
        return true;
    }

    return false;
}

function sendResponse(
    int $statusCode,
    array $payload,
    ?string $returnUrl = null
): never {
    http_response_code($statusCode);

    if (clientWantsJson()) {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');

        echo json_encode(
            $payload,
            JSON_UNESCAPED_SLASHES
            | JSON_UNESCAPED_UNICODE
            | JSON_INVALID_UTF8_SUBSTITUTE
        );

        exit;
    }

    renderHtmlResponse(
        $statusCode,
        $payload,
        $returnUrl
    );
}

function renderHtmlResponse(
    int $statusCode,
    array $payload,
    ?string $returnUrl = null
): never {
    $success = (bool) ($payload['success'] ?? false);
    $message = (string) (
        $payload['message']
        ?? (
            $success
                ? 'Your request was submitted.'
                : 'Your request could not be submitted.'
        )
    );

    $title = $success
        ? 'Request Submitted'
        : 'Request Not Submitted';

    $safeTitle = htmlspecialchars(
        $title,
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );

    $safeMessage = htmlspecialchars(
        $message,
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );

    $safeReturnUrl = htmlspecialchars(
        $returnUrl ?: '/contact/',
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );

    $errors = $payload['errors'] ?? [];
    $errorMarkup = '';

    if (is_array($errors) && $errors !== []) {
        $errorItems = '';

        foreach ($errors as $errorMessage) {
            if (!is_scalar($errorMessage)) {
                continue;
            }

            $errorItems .= sprintf(
                '<li>%s</li>',
                htmlspecialchars(
                    (string) $errorMessage,
                    ENT_QUOTES | ENT_SUBSTITUTE,
                    'UTF-8'
                )
            );
        }

        if ($errorItems !== '') {
            $errorMarkup = sprintf(
                '<ul class="response-card__errors">%s</ul>',
                $errorItems
            );
        }
    }

    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');

    echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <meta name="robots" content="noindex, nofollow">
  <title>{$safeTitle} | CDLWAY</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, Arial, sans-serif;
      background: #f5f5f3;
      color: #111113;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #f5f5f3;
    }

    .response-card {
      width: min(100%, 680px);
      padding: clamp(28px, 6vw, 56px);
      border: 1px solid #e4e4e7;
      border-top: 8px solid #e59e1f;
      background: #ffffff;
      box-shadow: 10px 10px 0 #111113;
    }

    .response-card__eyebrow {
      margin: 0 0 16px;
      color: #74757c;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .response-card h1 {
      margin: 0;
      font-size: clamp(36px, 8vw, 64px);
      line-height: 1;
      letter-spacing: -0.06em;
    }

    .response-card__message {
      margin: 24px 0 0;
      color: #74757c;
      font-size: 17px;
      line-height: 1.7;
    }

    .response-card__errors {
      margin: 24px 0 0;
      padding: 18px 18px 18px 36px;
      border-left: 5px solid #e59e1f;
      background: #f5f5f3;
      color: #111113;
      line-height: 1.6;
    }

    .response-card__link {
      display: inline-flex;
      min-height: 52px;
      align-items: center;
      justify-content: center;
      margin-top: 30px;
      padding: 14px 24px;
      color: #111113;
      background: #e59e1f;
      font-weight: 800;
      text-decoration: none;
    }

    .response-card__link:hover,
    .response-card__link:focus-visible {
      color: #ffffff;
      background: #111113;
    }

    .response-card__link:focus-visible {
      outline: 3px solid #e59e1f;
      outline-offset: 4px;
    }
  </style>
</head>
<body>
  <main class="response-card">
    <p class="response-card__eyebrow">
      CDLWAY Website Form
    </p>

    <h1>{$safeTitle}</h1>

    <p class="response-card__message">
      {$safeMessage}
    </p>

    {$errorMarkup}

    <a
      class="response-card__link"
      href="{$safeReturnUrl}"
    >
      Return to Website
    </a>
  </main>
</body>
</html>
HTML;

    exit;
}

function readRequestData(): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);

    if ($contentLength > MAX_REQUEST_BYTES) {
        sendResponse(
            413,
            [
                'success' => false,
                'message' => 'The submitted request is too large.',
                'errors' => [
                    'request' => 'Please shorten your message and submit the form again.',
                ],
            ]
        );
    }

    $contentType = strtolower(
        (string) ($_SERVER['CONTENT_TYPE'] ?? '')
    );

    if (str_contains($contentType, 'application/json')) {
        $rawBody = file_get_contents('php://input');

        if ($rawBody === false || trim($rawBody) === '') {
            return [];
        }

        try {
            $decoded = json_decode(
                $rawBody,
                true,
                32,
                JSON_THROW_ON_ERROR
            );
        } catch (JsonException) {
            sendResponse(
                400,
                [
                    'success' => false,
                    'message' => 'The request body contains invalid JSON.',
                    'errors' => [
                        'request' => 'Please reload the page and try again.',
                    ],
                ]
            );
        }

        return is_array($decoded)
            ? $decoded
            : [];
    }

    return $_POST;
}

function scalarString(mixed $value): string
{
    if (
        is_string($value)
        || is_int($value)
        || is_float($value)
        || is_bool($value)
    ) {
        return (string) $value;
    }

    return '';
}

function normalizeSingleLine(
    mixed $value,
    int $maximumLength
): string {
    $normalized = scalarString($value);

    $normalized = str_replace(
        ["\r", "\n", "\0"],
        ' ',
        $normalized
    );

    $normalized = preg_replace(
        '/[^\P{C}\t ]+/u',
        '',
        $normalized
    ) ?? $normalized;

    $normalized = preg_replace(
        '/[ \t]+/u',
        ' ',
        $normalized
    ) ?? $normalized;

    $normalized = trim($normalized);

    return limitText(
        $normalized,
        $maximumLength
    );
}

function normalizeMultiline(
    mixed $value,
    int $maximumLength
): string {
    $normalized = scalarString($value);

    $normalized = str_replace(
        ["\r\n", "\r", "\0"],
        ["\n", "\n", ''],
        $normalized
    );

    $normalized = preg_replace(
        '/[^\P{C}\n\t]+/u',
        '',
        $normalized
    ) ?? $normalized;

    $normalized = preg_replace(
        '/[ \t]+$/mu',
        '',
        $normalized
    ) ?? $normalized;

    $normalized = preg_replace(
        "/\n{4,}/",
        "\n\n\n",
        $normalized
    ) ?? $normalized;

    $normalized = trim($normalized);

    return limitText(
        $normalized,
        $maximumLength
    );
}

function textLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen(
            $value,
            'UTF-8'
        );
    }

    return strlen($value);
}

function limitText(
    string $value,
    int $maximumLength
): string {
    if (textLength($value) <= $maximumLength) {
        return $value;
    }

    if (function_exists('mb_substr')) {
        return mb_substr(
            $value,
            0,
            $maximumLength,
            'UTF-8'
        );
    }

    return substr(
        $value,
        0,
        $maximumLength
    );
}

function isConsentAccepted(mixed $value): bool
{
    $normalized = strtolower(
        trim(
            scalarString($value)
        )
    );

    return in_array(
        $normalized,
        [
            '1',
            'yes',
            'true',
            'on',
            'accepted',
        ],
        true
    );
}

function isValidSelection(string $value): bool
{
    if ($value === '') {
        return true;
    }

    return preg_match(
        '/^[\p{L}\p{N} .,_()\/&+\-:]+$/u',
        $value
    ) === 1;
}

function sanitizeSourcePage(mixed $value): string
{
    $url = normalizeSingleLine(
        $value,
        1000
    );

    if ($url === '') {
        return '';
    }

    if (
        filter_var(
            $url,
            FILTER_VALIDATE_URL
        ) === false
    ) {
        return '';
    }

    $scheme = strtolower(
        (string) parse_url(
            $url,
            PHP_URL_SCHEME
        )
    );

    if (
        $scheme !== 'http'
        && $scheme !== 'https'
    ) {
        return '';
    }

    return $url;
}

function buildReturnUrl(string $sourcePage): string
{
    if ($sourcePage === '') {
        return '/contact/';
    }

    $sourceHost = strtolower(
        (string) parse_url(
            $sourcePage,
            PHP_URL_HOST
        )
    );

    $currentHost = strtolower(
        preg_replace(
            '/:\d+$/',
            '',
            (string) ($_SERVER['HTTP_HOST'] ?? '')
        ) ?? ''
    );

    if (
        $sourceHost === ''
        || $currentHost === ''
        || $sourceHost !== $currentHost
    ) {
        return '/contact/';
    }

    return $sourcePage;
}

function sanitizeFormData(
    array $requestData,
    array $fieldLimits
): array {
    $cleanData = [];

    foreach ($fieldLimits as $field => $maximumLength) {
        $value = $requestData[$field] ?? '';

        if (
            $field === 'message'
            || $field === 'goals'
        ) {
            $cleanData[$field] =
                normalizeMultiline(
                    $value,
                    $maximumLength
                );

            continue;
        }

        if ($field === 'sourcePage') {
            $cleanData[$field] =
                sanitizeSourcePage($value);

            continue;
        }

        if ($field === 'consent') {
            $cleanData[$field] =
                isConsentAccepted($value)
                    ? 'Yes'
                    : '';

            continue;
        }

        $cleanData[$field] =
            normalizeSingleLine(
                $value,
                $maximumLength
            );
    }

    return $cleanData;
}

function validateFormData(
    array $data,
    array $definition,
    array $fieldLabels
): array {
    $errors = [];

    foreach ($definition['required'] as $field) {
        if (
            !array_key_exists(
                $field,
                $data
            )
            || trim(
                (string) $data[$field]
            ) === ''
        ) {
            $label = $fieldLabels[$field]
                ?? $field;

            $errors[$field] =
                sprintf(
                    '%s is required.',
                    $label
                );
        }
    }

    $fullName = (string) (
        $data['fullName'] ?? ''
    );

    if (
        $fullName !== ''
        && textLength($fullName) < 2
    ) {
        $errors['fullName'] =
            'Please enter your full name.';
    }

    if (
        $fullName !== ''
        && preg_match(
            '/^[\p{L}\p{M} .\'’\-]+$/u',
            $fullName
        ) !== 1
    ) {
        $errors['fullName'] =
            'Please enter a valid full name.';
    }

    $email = (string) (
        $data['email'] ?? ''
    );

    if (
        $email !== ''
        && filter_var(
            $email,
            FILTER_VALIDATE_EMAIL
        ) === false
    ) {
        $errors['email'] =
            'Please enter a valid email address.';
    }

    $selectionFields = [
        'program',
        'trainingProgram',
        'licenseStatus',
        'trainingFormat',
        'startPeriod',
        'careerDirection',
        'collaborationType',
        'assistanceType',
    ];

    foreach ($selectionFields as $field) {
        $value = (string) (
            $data[$field] ?? ''
        );

        if (
            $value !== ''
            && !isValidSelection($value)
        ) {
            $errors[$field] =
                sprintf(
                    'Please select a valid %s.',
                    strtolower(
                        $fieldLabels[$field]
                        ?? $field
                    )
                );
        }
    }

    foreach (
        [
            'message',
            'goals',
        ] as $longField
    ) {
        $value = (string) (
            $data[$longField] ?? ''
        );

        if (
            $value !== ''
            && textLength($value) < 10
        ) {
            $errors[$longField] =
                sprintf(
                    '%s must contain at least 10 characters.',
                    $fieldLabels[$longField]
                    ?? ucfirst($longField)
                );
        }
    }

    return $errors;
}

function containsSpamTrap(array $requestData): bool
{
    $trapFields = [
        'website',
        'companyWebsite',
        'homepage',
        '_gotcha',
    ];

    foreach ($trapFields as $field) {
        if (
            trim(
                scalarString(
                    $requestData[$field] ?? ''
                )
            ) !== ''
        ) {
            return true;
        }
    }

    return false;
}

function getClientFingerprint(): string
{
    $address = (string) (
        $_SERVER['REMOTE_ADDR']
        ?? 'unknown'
    );

    $userAgent = (string) (
        $_SERVER['HTTP_USER_AGENT']
        ?? 'unknown'
    );

    return hash(
        'sha256',
        $address . '|' . $userAgent
    );
}

function enforceRateLimit(): void
{
    $storageDirectory =
        rtrim(
            sys_get_temp_dir(),
            DIRECTORY_SEPARATOR
        )
        . DIRECTORY_SEPARATOR
        . 'cdlway-form-rate-limit';

    if (
        !is_dir($storageDirectory)
        && !@mkdir(
            $storageDirectory,
            0700,
            true
        )
        && !is_dir($storageDirectory)
    ) {
        return;
    }

    $filePath =
        $storageDirectory
        . DIRECTORY_SEPARATOR
        . getClientFingerprint()
        . '.json';

    $handle = @fopen(
        $filePath,
        'c+'
    );

    if ($handle === false) {
        return;
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            return;
        }

        rewind($handle);

        $existingContent =
            stream_get_contents($handle);

        $timestamps = [];

        if (
            is_string($existingContent)
            && $existingContent !== ''
        ) {
            try {
                $decoded = json_decode(
                    $existingContent,
                    true,
                    16,
                    JSON_THROW_ON_ERROR
                );

                if (is_array($decoded)) {
                    $timestamps = array_values(
                        array_filter(
                            $decoded,
                            static fn (mixed $timestamp): bool =>
                                is_int($timestamp)
                                || ctype_digit(
                                    (string) $timestamp
                                )
                        )
                    );
                }
            } catch (JsonException) {
                $timestamps = [];
            }
        }

        $now = time();
        $windowStart =
            $now
            - RATE_LIMIT_WINDOW_SECONDS;

        $timestamps = array_values(
            array_filter(
                $timestamps,
                static fn (mixed $timestamp): bool =>
                    (int) $timestamp
                    >= $windowStart
            )
        );

        if (
            count($timestamps)
            >= RATE_LIMIT_REQUESTS
        ) {
            flock($handle, LOCK_UN);
            fclose($handle);

            sendResponse(
                429,
                [
                    'success' => false,
                    'message' => 'Too many requests were submitted from this browser.',
                    'errors' => [
                        'request' => 'Please wait a few minutes before trying again.',
                    ],
                ]
            );
        }

        $timestamps[] = $now;

        rewind($handle);
        ftruncate($handle, 0);

        fwrite(
            $handle,
            json_encode(
                $timestamps,
                JSON_THROW_ON_ERROR
            )
        );

        fflush($handle);
        flock($handle, LOCK_UN);
    } catch (Throwable) {
    } finally {
        if (is_resource($handle)) {
            fclose($handle);
        }
    }
}

function loadSiteConfig(): array
{
    $configPath =
        __DIR__
        . DIRECTORY_SEPARATOR
        . 'config'
        . DIRECTORY_SEPARATOR
        . 'site-config.json';

    if (!is_file($configPath)) {
        return [];
    }

    $content = @file_get_contents(
        $configPath
    );

    if (
        $content === false
        || trim($content) === ''
    ) {
        return [];
    }

    try {
        $config = json_decode(
            $content,
            true,
            64,
            JSON_THROW_ON_ERROR
        );
    } catch (JsonException) {
        return [];
    }

    return is_array($config)
        ? $config
        : [];
}

function getNestedConfigValue(
    array $config,
    array $paths
): mixed {
    foreach ($paths as $path) {
        $segments = explode(
            '.',
            $path
        );

        $current = $config;
        $found = true;

        foreach ($segments as $segment) {
            if (
                !is_array($current)
                || !array_key_exists(
                    $segment,
                    $current
                )
            ) {
                $found = false;
                break;
            }

            $current = $current[$segment];
        }

        if (
            $found
            && $current !== null
            && $current !== ''
        ) {
            return $current;
        }
    }

    return null;
}

function isPlaceholderEmail(string $email): bool
{
    $domain = strtolower(
        (string) substr(
            strrchr(
                $email,
                '@'
            ) ?: '',
            1
        )
    );

    return (
        $domain === ''
        || $domain === 'localhost'
        || str_ends_with(
            $domain,
            '.example'
        )
        || str_ends_with(
            $domain,
            '.invalid'
        )
        || str_ends_with(
            $domain,
            '.test'
        )
    );
}

function getRecipientEmail(array $config): string
{
    $environmentRecipient =
        trim(
            (string) getenv(
                'CDL_CONTACT_RECIPIENT'
            )
        );

    if (
        $environmentRecipient !== ''
        && filter_var(
            $environmentRecipient,
            FILTER_VALIDATE_EMAIL
        ) !== false
    ) {
        return $environmentRecipient;
    }

    $configuredRecipient =
        normalizeSingleLine(
            getNestedConfigValue(
                $config,
                [
                    'forms.recipientEmail',
                    'contact.recipientEmail',
                    'contact.email',
                    'company.email',
                    'corporateEmail',
                ]
            ),
            254
        );

    if (
        filter_var(
            $configuredRecipient,
            FILTER_VALIDATE_EMAIL
        ) === false
    ) {
        return '';
    }

    return $configuredRecipient;
}

function getBrandName(array $config): string
{
    $brandName =
        normalizeSingleLine(
            getNestedConfigValue(
                $config,
                [
                    'brandName',
                    'company.name',
                    'site.name',
                ]
            ),
            120
        );

    return $brandName !== ''
        ? $brandName
        : 'CDLWAY';
}

function getFromEmail(array $config): string
{
    $environmentFrom =
        trim(
            (string) getenv(
                'CDL_CONTACT_FROM'
            )
        );

    if (
        $environmentFrom !== ''
        && filter_var(
            $environmentFrom,
            FILTER_VALIDATE_EMAIL
        ) !== false
    ) {
        return $environmentFrom;
    }

    $configuredFrom =
        normalizeSingleLine(
            getNestedConfigValue(
                $config,
                [
                    'forms.fromEmail',
                    'contact.fromEmail',
                ]
            ),
            254
        );

    if (
        $configuredFrom !== ''
        && filter_var(
            $configuredFrom,
            FILTER_VALIDATE_EMAIL
        ) !== false
    ) {
        return $configuredFrom;
    }

    $host = strtolower(
        preg_replace(
            '/:\d+$/',
            '',
            (string) ($_SERVER['HTTP_HOST'] ?? '')
        ) ?? ''
    );

    if (
        preg_match(
            '/^[a-z0-9.-]+\.[a-z]{2,}$/',
            $host
        ) !== 1
    ) {
        return '';
    }

    return 'no-reply@' . $host;
}

function encodeMailSubject(string $subject): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader(
            $subject,
            'UTF-8',
            'B',
            "\r\n"
        );
    }

    return $subject;
}

function buildMailBody(
    array $data,
    array $fieldLabels,
    string $subject,
    string $brandName
): string {
    $lines = [
        $brandName . ' Website Submission',
        str_repeat('=', 48),
        '',
        'Inquiry: ' . $subject,
        'Submitted: ' . gmdate('Y-m-d H:i:s') . ' UTC',
        '',
    ];

    $orderedFields = [
        'fullName',
        'email',
        'program',
        'trainingProgram',
        'licenseStatus',
        'trainingFormat',
        'startPeriod',
        'careerDirection',
        'collaborationType',
        'assistanceType',
        'message',
        'goals',
        'consent',
        'sourcePage',
    ];

    foreach ($orderedFields as $field) {
        $value = trim(
            (string) (
                $data[$field]
                ?? ''
            )
        );

        if ($value === '') {
            continue;
        }

        $label =
            $fieldLabels[$field]
            ?? $field;

        if (
            $field === 'message'
            || $field === 'goals'
        ) {
            $lines[] = $label . ':';
            $lines[] = $value;
            $lines[] = '';

            continue;
        }

        $lines[] =
            $label
            . ': '
            . $value;
    }

    $lines[] = '';
    $lines[] = str_repeat('-', 48);
    $lines[] = 'This submission was sent through the website form.';
    $lines[] = 'Do not request sensitive financial, medical, identity, or account information through ordinary email.';

    return implode(
        "\r\n",
        $lines
    );
}

function deliverMail(
    string $recipient,
    string $fromEmail,
    string $replyTo,
    string $brandName,
    string $subject,
    string $message
): bool {
    if (!function_exists('mail')) {
        return false;
    }

    $safeBrandName = str_replace(
        ["\r", "\n"],
        '',
        $brandName
    );

    $safeFromEmail = str_replace(
        ["\r", "\n"],
        '',
        $fromEmail
    );

    $safeReplyTo = str_replace(
        ["\r", "\n"],
        '',
        $replyTo
    );

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        sprintf(
            'From: %s <%s>',
            $safeBrandName,
            $safeFromEmail
        ),
        sprintf(
            'Reply-To: %s',
            $safeReplyTo
        ),
        'X-Mailer: PHP/' . PHP_VERSION,
    ];

    return @mail(
        $recipient,
        encodeMailSubject(
            '['
            . $safeBrandName
            . '] '
            . $subject
        ),
        $message,
        implode(
            "\r\n",
            $headers
        )
    );
}

if (
    strtoupper(
        (string) (
            $_SERVER['REQUEST_METHOD']
            ?? ''
        )
    ) !== 'POST'
) {
    header('Allow: POST');

    sendResponse(
        405,
        [
            'success' => false,
            'message' => 'This endpoint accepts form submissions only.',
            'errors' => [
                'request' => 'Please submit a form from the website.',
            ],
        ]
    );
}

$requestData = readRequestData();

if (containsSpamTrap($requestData)) {
    sendResponse(
        200,
        [
            'success' => true,
            'message' => 'Your request was submitted successfully.',
            'errors' => [],
        ]
    );
}

enforceRateLimit();

$cleanData = sanitizeFormData(
    $requestData,
    $fieldLimits
);

$formType = $cleanData['formType'] ?? '';

if (
    $formType === ''
    || !array_key_exists(
        $formType,
        $formDefinitions
    )
) {
    sendResponse(
        422,
        [
            'success' => false,
            'message' => 'The selected form type is not valid.',
            'errors' => [
                'formType' => 'Please reload the page and submit the form again.',
            ],
        ],
        buildReturnUrl(
            $cleanData['sourcePage'] ?? ''
        )
    );
}

$definition =
    $formDefinitions[$formType];

$errors = validateFormData(
    $cleanData,
    $definition,
    $fieldLabels
);

$returnUrl = buildReturnUrl(
    $cleanData['sourcePage'] ?? ''
);

if ($errors !== []) {
    sendResponse(
        422,
        [
            'success' => false,
            'message' => 'Please correct the highlighted fields and submit the form again.',
            'errors' => $errors,
        ],
        $returnUrl
    );
}

$config = loadSiteConfig();

$recipient = getRecipientEmail(
    $config
);

if (
    $recipient === ''
    || isPlaceholderEmail($recipient)
) {
    sendResponse(
        503,
        [
            'success' => false,
            'message' => 'Form delivery has not been configured yet.',
            'errors' => [
                'request' => 'Add a real recipient email address to config/site-config.json or set the CDL_CONTACT_RECIPIENT environment variable.',
            ],
        ],
        $returnUrl
    );
}

$fromEmail = getFromEmail(
    $config
);

if (
    $fromEmail === ''
    || isPlaceholderEmail($fromEmail)
) {
    sendResponse(
        503,
        [
            'success' => false,
            'message' => 'The form sender address has not been configured.',
            'errors' => [
                'request' => 'Configure a valid website domain or set the CDL_CONTACT_FROM environment variable.',
            ],
        ],
        $returnUrl
    );
}

$brandName = getBrandName(
    $config
);

$subject =
    $definition['subject'];

$message = buildMailBody(
    $cleanData,
    $fieldLabels,
    $subject,
    $brandName
);

$delivered = deliverMail(
    $recipient,
    $fromEmail,
    $cleanData['email'],
    $brandName,
    $subject,
    $message
);

if (!$delivered) {
    sendResponse(
        500,
        [
            'success' => false,
            'message' => 'The request could not be delivered at this time.',
            'errors' => [
                'request' => 'Please try again later or contact the corporate email address directly.',
            ],
        ],
        $returnUrl
    );
}

sendResponse(
    200,
    [
        'success' => true,
        'message' => 'Your request was submitted successfully. A response will be sent to the email address you provided.',
        'errors' => [],
        'formType' => $formType,
    ],
    $returnUrl
);
