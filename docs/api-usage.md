# API usage and route inventory

Use the running server at `http://127.0.0.1:8000/docs` or `/openapi.json` for request fields, content types, response schemas and permission requirements. This inventory is extracted from the route decorators in the local source; it is not a substitute for the deployed version's OpenAPI schema.

## Integration basics

Most HTTP endpoints return `{ success, message, data }`; shared error handlers provide an error payload. Some endpoints (OAuth token, files, health and payment callback) have specialised contracts. Protected HTTP calls use `Authorization: Bearer <access_token>`. Route dependencies enforce role and ownership checks; a URL prefix alone is not an access policy. Lists generally use page-based pagination starting at 1. Upload fields and accepted types are endpoint-specific.

### Registration and account security

1. `POST /register/email-code` requests a code for the registration email.
2. `POST /register` supplies `email_code`, account details and Terms acceptance. Public registration cannot create an admin.
3. `POST /login` uses form credentials and returns tokens; `/token` supports Swagger's OAuth flow.
4. Signed-in users request purpose-specific email codes with `POST /auth/email-code`; submit the code to `/auth/verify-email` or `/auth/change-email` as appropriate.
5. Console email delivery logs the actual code; SMTP sends it. Email verification does not accept arbitrary six-digit values. Phone verification is still demo-only and sends no SMS.
6. Refresh/logout use the refresh-token contract; access tokens are not refresh tokens.

See [deployment and credentials](deployment.md) for mail and social-login configuration.

### Provider onboarding

Identity, qualification and payout-account setup can be submitted independently. Admin approval controls the first two; iyzico synchronisation controls payout status. New orders require both approvals and an active payout account. Sample provider records contain payout drafts only. Use `/provider/submerchant` rather than a retired seed command.

### Booking and checkout

Create bookings through `POST /bookings` using the declared multipart fields, canonical service category and optional attachments. The provider submits a visit quote; the customer accepts and pays the `visit_fee` stage. The provider records arrival and submits a final quote. After any revisions, the customer accepts and pays the `service_fee` stage. Provider completion and customer confirmation follow, then review.

Follow the checkout response and verified iyzico callback flow; client navigation alone does not establish payment success. Cancellation does not automatically refund fees. Refund requests proceed through provider review and, when applicable, admin appeal. Refer to schemas and business action checks for the exact allowed states and amounts.

### AI and review search

`POST /ai/chat/sync` returns synchronous chat output; asynchronous routes use Celery/task records. Incomplete booking requests return draft/missing-information data. Supported write actions return confirmation cards backed by stored pending actions. Confirm through `POST /ai/actions/confirm` with `action_id`; the server rechecks the stored payload and business permissions.

Vector review search requires Milvus, embeddings and a populated index. An admin can initialise the collection, enqueue full review synchronisation and inspect review-sync status through the corresponding `/ai/milvus/*` routes below. See [deployment](deployment.md).

### WebSocket authentication

Connect to `/ws/me` or `/ws/chats/{chat_room_id}` and send this as the first frame:

```json
{"type":"auth","token":"<access_token>"}
```

Do not append tokens to the URL. The socket is accepted before authentication. Chat-room membership and current account permissions are checked. HTTP endpoints persist history and upload attachments; WebSockets deliver live chat/read/presence events. Upload files first, then reference their attachment IDs in a message.

## Source-derived routes

The tables identify the route handler and source module. Permissions, required fields and response models must be read from the current OpenAPI schema and source dependencies. Regenerate this inventory when adding, removing or renaming a route.

### [backend/routers/admin.py](../backend/routers/admin.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/admin/dashboard` | `get_admin_dashboard` |
| `GET` | `/admin/users` | `get_users` |
| `PUT` | `/admin/users/{user_id}/status` | `update_user_status` |
| `GET` | `/admin/providers` | `get_admin_providers` |
| `GET` | `/admin/providers/{provider_profile_id}` | `get_admin_provider_by_id` |
| `PUT` | `/admin/providers/{provider_profile_id}/verification` | `update_provider_verification` |
| `GET` | `/admin/providers/{provider_profile_id}/verification-history` | `get_provider_verification_history` |
| `GET` | `/admin/provider-portfolios` | `get_admin_provider_portfolios` |
| `GET` | `/admin/provider-portfolios/{portfolio_id}` | `get_admin_provider_portfolio_by_id` |
| `PUT` | `/admin/provider-portfolios/{portfolio_id}/verification` | `update_provider_portfolio_verification` |
| `GET` | `/admin/bookings` | `get_all_bookings` |
| `GET` | `/admin/bookings/{booking_id}` | `get_admin_booking_detail` |
| `PUT` | `/admin/bookings/{booking_id}/status` | `admin_update_booking_status` |
| `GET` | `/admin/payments` | `get_all_payments` |
| `GET` | `/admin/submerchants` | `get_admin_submerchants` |
| `POST` | `/admin/payments/{payment_id}/settlement/retry` | `retry_payment_settlement` |
| `GET` | `/admin/refund-requests` | `get_all_refund_requests` |
| `GET` | `/admin/refund-requests/{refund_request_id}/history` | `get_refund_request_status_history` |
| `PUT` | `/admin/refund-requests/{refund_request_id}/approve` | `admin_approve_refund_request` |
| `PUT` | `/admin/refund-requests/{refund_request_id}/reject` | `admin_reject_refund_request` |
| `GET` | `/admin/chats` | `get_all_chats` |
| `GET` | `/admin/chats/{chat_room_id}/messages` | `get_admin_chat_messages` |
| `GET` | `/admin/complaints` | `get_all_complaints` |
| `GET` | `/admin/complaints/{complaint_id}` | `get_complaint_by_id` |
| `PUT` | `/admin/complaints/{complaint_id}/status` | `update_complaint_status` |
| `GET` | `/admin/complaints/{complaint_id}/history` | `get_complaint_status_history` |
| `GET` | `/admin/reviews` | `get_all_reviews` |
| `PUT` | `/admin/reviews/{review_id}/visibility` | `update_review_visibility` |
| `GET` | `/admin/reviews/low-value` | `get_low_value_reviews` |
| `POST` | `/admin/reviews/low-value/hide` | `hide_low_value_reviews` |
| `GET` | `/admin/reviews/high-value-hidden` | `get_hidden_high_value_reviews` |
| `POST` | `/admin/reviews/high-value-hidden/show` | `show_hidden_high_value_reviews` |

### [backend/routers/admin_verification.py](../backend/routers/admin_verification.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/admin/identity-verifications` | `list_identity_verifications` |
| `GET` | `/admin/identity-verifications/{application_id}` | `get_identity_verification` |
| `PUT` | `/admin/identity-verifications/{application_id}/decision` | `decide_identity_verification` |
| `GET` | `/admin/qualification-verifications` | `list_qualification_verifications` |
| `GET` | `/admin/qualification-verifications/{application_id}` | `get_qualification_verification` |
| `PUT` | `/admin/qualification-verifications/{application_id}/decision` | `decide_qualification_verification` |

### [backend/routers/ai.py](../backend/routers/ai.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/ai/tasks` | `get_ai_tasks` |
| `GET` | `/ai/tasks/{task_id}` | `get_ai_task_status` |
| `POST` | `/ai/chat` | `enqueue_ai_chat` |
| `POST` | `/ai/chat/async` | `enqueue_ai_chat_alias` |
| `POST` | `/ai/chat/sync` | `ai_chat_sync` |
| `GET` | `/ai/chat/messages` | `get_ai_chat_messages` |
| `DELETE` | `/ai/chat/messages` | `clear_ai_chat_messages` |
| `GET` | `/ai/tools` | `get_ai_tools` |
| `POST` | `/ai/tools/run` | `run_ai_tool` |
| `POST` | `/ai/tools/agent-preview` | `preview_ai_tool_agent` |
| `GET` | `/ai/tool-call-logs` | `get_ai_tool_call_logs` |
| `GET` | `/ai/actions` | `get_ai_pending_actions` |
| `PUT` | `/ai/actions/{action_id}/cancel` | `cancel_ai_action` |
| `POST` | `/ai/actions/confirm` | `confirm_ai_action` |
| `GET` | `/ai/actions/{action_id}` | `get_ai_pending_action` |
| `POST` | `/ai/recommend-providers` | `recommend_providers` |
| `GET` | `/ai/oauth` | `get_ai_oauth_status` |
| `POST` | `/ai/oauth/chatgpt/start` | `start_chatgpt_oauth` |
| `POST` | `/ai/oauth/chatgpt/cancel` | `cancel_chatgpt_oauth` |
| `POST` | `/ai/oauth/chatgpt/logout` | `logout_chatgpt_oauth` |
| `PUT` | `/ai/oauth` | `update_ai_oauth_auth` |
| `PUT` | `/ai/oauth/key` | `update_ai_oauth_key` |
| `DELETE` | `/ai/oauth/key` | `delete_ai_oauth_key` |
| `POST` | `/ai/oauth/models` | `list_ai_oauth_models` |
| `POST` | `/ai/oauth/grok/start` | `start_grok_oauth` |
| `POST` | `/ai/oauth/grok/cancel` | `cancel_grok_oauth` |
| `POST` | `/ai/oauth/grok/logout` | `logout_grok_oauth` |
| `GET` | `/ai/health/redis` | `check_ai_redis_health` |
| `GET` | `/ai/health/milvus` | `check_ai_milvus_health` |
| `GET` | `/ai/health/qwen` | `check_ai_qwen_health` |
| `GET` | `/ai/health/embedding` | `check_ai_embedding_health` |
| `POST` | `/ai/milvus/review-collection` | `create_ai_review_collection` |
| `POST` | `/ai/milvus/sync-reviews` | `sync_reviews_to_milvus` |
| `GET` | `/ai/milvus/review-sync-status` | `get_review_sync_status` |
| `POST` | `/ai/milvus/retry-failed-reviews` | `retry_failed_review_embeddings` |

### [backend/routers/auth.py](../backend/routers/auth.py)

| Method | Path | Handler |
| --- | --- | --- |
| `POST` | `/register/email-code` | `request_register_email_code` |
| `POST` | `/register` | `register` |
| `POST` | `/social-login` | `social_login` |
| `POST` | `/login` | `login` |
| `POST` | `/token` | `swagger_login` |
| `POST` | `/refresh-token` | `refresh_token` |
| `POST` | `/logout` | `logout` |
| `GET` | `/me` | `get_me` |
| `PUT` | `/me` | `update_me` |
| `PATCH` | `/me` | `patch_me` |
| `POST` | `/me/avatar` | `upload_me_avatar` |
| `POST` | `/auth/email-code` | `request_email_code` |
| `POST` | `/auth/verify-email` | `verify_email` |
| `POST` | `/auth/verify-phone` | `verify_phone` |
| `POST` | `/auth/change-password` | `change_password` |
| `POST` | `/auth/change-email` | `change_email` |

### [backend/routers/customer/address_book.py](../backend/routers/customer/address_book.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/customer/addresses` | `list_addresses` |
| `POST` | `/customer/addresses` | `create_address` |
| `PATCH` | `/customer/addresses/{address_id}` | `update_address` |
| `DELETE` | `/customer/addresses/{address_id}` | `delete_address` |

### [backend/routers/customer/bookings.py](../backend/routers/customer/bookings.py)

| Method | Path | Handler |
| --- | --- | --- |
| `POST` | `/bookings` | `create_booking` |
| `GET` | `/customer/bookings` | `get_customer_bookings` |
| `PUT` | `/customer/bookings/{booking_id}` | `update_pending_booking` |
| `PUT` | `/customer/bookings/{booking_id}/pay` | `pay_booking_by_booking_id` |
| `GET` | `/customer/payments` | `get_customer_payments` |
| `POST` | `/bookings/{booking_id}/refund-requests` | `create_refund_request` |
| `GET` | `/customer/refund-requests` | `get_customer_refund_requests` |
| `PUT` | `/refund-requests/{refund_request_id}/cancel` | `cancel_refund_request` |
| `PUT` | `/refund-requests/{refund_request_id}/appeal` | `appeal_refund_request` |
| `PUT` | `/customer/bookings/{booking_id}/reject-quote` | `reject_booking_quote` |
| `PUT` | `/customer/bookings/{booking_id}/accept-quote` | `accept_booking_quote` |
| `PUT` | `/customer/bookings/{booking_id}/accept-final-quote` | `accept_final_quote` |
| `PUT` | `/customer/bookings/{booking_id}/reject-final-quote` | `reject_final_quote` |
| `PUT` | `/customer/bookings/{booking_id}/close-final-quote` | `close_final_quote` |
| `PUT` | `/customer/bookings/{booking_id}/cancel` | `cancel_booking` |
| `PUT` | `/customer/bookings/{booking_id}/confirm-complete` | `confirm_booking_complete` |
| `PUT` | `/customer/bookings/{booking_id}/reject-complete` | `reject_booking_complete` |

### [backend/routers/customer/discovery.py](../backend/routers/customer/discovery.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/customer/home/recommendations` | `get_customer_home_recommendations` |
| `GET` | `/customer/providers/search` | `search_customer_provider_profiles` |
| `GET` | `/customer/providers/{provider_id}` | `get_customer_provider_detail` |
| `POST` | `/customer/favorites/{provider_profile_id}` | `add_favorite_provider` |
| `GET` | `/customer/favorites` | `get_favorite_providers` |
| `DELETE` | `/customer/favorites/{provider_profile_id}` | `remove_favorite_provider` |
| `POST` | `/customer/chats/{provider_profile_id}` | `open_chat_with_provider` |
| `GET` | `/customer/chats` | `get_customer_chats` |

### [backend/routers/customer/feedback.py](../backend/routers/customer/feedback.py)

| Method | Path | Handler |
| --- | --- | --- |
| `POST` | `/bookings/{booking_id}/complaints` | `create_complaint` |
| `GET` | `/customer/complaints` | `get_customer_complaints` |
| `POST` | `/bookings/{booking_id}/review` | `create_review` |
| `GET` | `/customer/reviews` | `get_customer_reviews` |
| `PUT` | `/reviews/{review_id}` | `update_review` |
| `DELETE` | `/reviews/{review_id}` | `delete_review` |

### [backend/routers/customer/profile.py](../backend/routers/customer/profile.py)

| Method | Path | Handler |
| --- | --- | --- |
| `POST` | `/customer/profile` | `create_customer_profile` |
| `GET` | `/customer/profile` | `get_customer_profile` |
| `PUT` | `/customer/profile/service-province` | `update_customer_service_province` |
| `PUT` | `/customer/profile` | `update_customer_profile` |
| `PATCH` | `/customer/profile` | `patch_customer_profile` |

### [backend/routers/marketplace.py](../backend/routers/marketplace.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/provider/submerchant` | `get_provider_submerchant_profile` |
| `POST` | `/provider/submerchant` | `create_provider_submerchant_profile` |
| `PUT` | `/provider/submerchant` | `update_provider_submerchant_profile` |

### [backend/routers/payment.py](../backend/routers/payment.py)

| Method | Path | Handler |
| --- | --- | --- |
| `POST` | `/payments/iyzico/callback` | `iyzico_checkout_callback` |

### [backend/routers/provider.py](../backend/routers/provider.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/provider/dashboard` | `provider_dashboard` |
| `POST` | `/provider/profile` | `create_provider_profile` |
| `GET` | `/provider/profile` | `get_provider_profile` |
| `POST` | `/provider/certificates/upload` | `upload_provider_certificate` |
| `PUT` | `/provider/profile` | `update_provider_profile` |
| `PUT` | `/provider/profile/contact` | `update_provider_contact_profile` |
| `PATCH` | `/provider/profile/contact` | `patch_provider_contact_profile` |
| `PATCH` | `/provider/profile/operating-settings` | `patch_provider_operating_settings` |
| `GET` | `/provider/availability` | `get_provider_availability` |
| `PUT` | `/provider/availability` | `update_provider_availability` |
| `GET` | `/provider/availability/overrides` | `get_provider_availability_overrides` |
| `PUT` | `/provider/availability/overrides/{override_date}` | `update_provider_availability_override` |
| `DELETE` | `/provider/availability/overrides/{override_date}` | `remove_provider_availability_override` |
| `POST` | `/provider/portfolio` | `create_provider_portfolio` |
| `GET` | `/provider/portfolio/{portfolio_id}` | `get_provider_portfolio_item` |
| `GET` | `/provider/portfolio` | `get_provider_portfolio` |
| `GET` | `/provider/reviews` | `get_provider_reviews` |
| `DELETE` | `/provider/portfolio/{portfolio_id}` | `delete_provider_portfolio` |
| `GET` | `/provider/chats` | `get_provider_chats` |
| `GET` | `/provider/bookings` | `get_provider_bookings` |
| `GET` | `/provider/bookings/schedule` | `get_provider_schedule_bookings` |
| `GET` | `/provider/payments` | `get_provider_payments` |
| `GET` | `/provider/refund-requests` | `get_provider_refund_requests` |
| `PUT` | `/provider/refund-requests/{refund_request_id}/approve` | `approve_refund_request` |
| `PUT` | `/provider/refund-requests/{refund_request_id}/reject` | `reject_refund_request` |
| `PUT` | `/provider/bookings/{booking_id}/quote` | `quote_booking` |
| `PUT` | `/provider/bookings/{booking_id}/reject` | `reject_booking` |
| `PUT` | `/provider/bookings/{booking_id}/complete` | `complete_booking` |
| `PUT` | `/provider/bookings/{booking_id}/start-visit` | `start_visit` |
| `PUT` | `/provider/bookings/{booking_id}/final-quote` | `submit_final_quote` |

### [backend/routers/provider_verification.py](../backend/routers/provider_verification.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/verification-files/{kind}/{filename}` | `download_verification_file` |
| `GET` | `/provider/verification-status` | `get_verification_status` |
| `POST` | `/provider/identity-verification` | `submit_identity_verification` |
| `GET` | `/provider/identity-verification` | `get_identity_verification` |
| `POST` | `/provider/qualification-files/upload` | `upload_qualification_files` |
| `POST` | `/provider/qualification-verification` | `submit_qualification_verification` |
| `GET` | `/provider/qualification-verification` | `get_qualification_verification` |
| `GET` | `/provider/approved-services` | `get_approved_services` |
| `PATCH` | `/provider/operating-settings` | `update_operating_settings` |
| `PUT` | `/provider/service-areas` | `replace_service_areas` |
| `GET` | `/provider/service-areas` | `get_service_areas` |

### [backend/routers/public.py](../backend/routers/public.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/locations` | `get_service_locations` |
| `GET` | `/locations/{location_id}` | `get_service_location` |
| `GET` | `/places/autocomplete` | `autocomplete_places` |
| `GET` | `/places/details` | `details_for_place` |
| `GET` | `/providers` | `get_all_providers` |
| `GET` | `/providers/{provider_id}` | `get_provider_by_id` |
| `GET` | `/providers/{provider_id}/reviews` | `get_provider_reviews` |
| `GET` | `/providers/{provider_id}/portfolio` | `get_provider_public_portfolio` |
| `GET` | `/providers/{provider_id}/portfolio/{portfolio_id}` | `get_provider_public_portfolio_item` |
| `GET` | `/providers/{provider_id}/rating-summary` | `get_provider_rating_summary` |
| `GET` | `/reviews/{review_id}` | `get_review_by_id` |
| `GET` | `/faq` | `get_help_faq` |

### [backend/routers/shared.py](../backend/routers/shared.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/chats/{chat_room_id}/messages` | `get_chat_messages` |
| `POST` | `/chats/{chat_room_id}/attachments` | `upload_chat_attachment` |
| `DELETE` | `/chats/{chat_room_id}/attachments/{attachment_id}` | `delete_unsent_chat_attachment` |
| `POST` | `/chats/{chat_room_id}/messages` | `send_chat_message` |
| `GET` | `/notifications` | `get_notifications` |
| `GET` | `/notifications/summary` | `get_notification_summary` |
| `PUT` | `/notifications/read-all` | `mark_all_notifications_as_read` |
| `PUT` | `/notifications/{notification_id}/read` | `mark_notification_as_read` |
| `GET` | `/chats/{chat_room_id}/bookings` | `get_chat_bookings` |
| `GET` | `/bookings/{booking_id}` | `get_booking_by_id` |
| `POST` | `/bookings/{booking_id}/attachments` | `upload_booking_attachment` |
| `GET` | `/bookings/{booking_id}/attachments` | `get_booking_attachments` |
| `DELETE` | `/bookings/{booking_id}/attachments/{attachment_id}` | `delete_booking_attachment` |
| `GET` | `/bookings/{booking_id}/history` | `get_booking_status_history` |

### [backend/routers/websocket.py](../backend/routers/websocket.py)

| Method | Path | Handler |
| --- | --- | --- |
| `WEBSOCKET` | `/ws/chats/{chat_room_id}` | `chat_websocket` |
| `WEBSOCKET` | `/ws/me` | `user_websocket` |

### [backend/main.py](../backend/main.py)

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/` | `home` |
| `GET` | `/health` | `health_check` |
