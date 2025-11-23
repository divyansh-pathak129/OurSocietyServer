# OurSociety Backend Server

A Node.js/Express backend server for the OurSociety application, providing RESTful APIs for society management, maintenance tracking, forums, events, and more.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Debugging](#debugging)
- [Testing](#testing)
- [Common Issues](#common-issues)

## 🔧 Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **MongoDB Atlas** account (or local MongoDB instance)
- **Clerk** account for authentication
- **UploadThing** account (optional, for file uploads)

## 📦 Installation

1. **Navigate to the backend directory:**

   ```bash
   cd OurSocietyServer
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create a `.env` file** in the `OurSocietyServer` directory (see [Environment Variables](#environment-variables) below)

4. **Initialize the database** (optional, if you need to set up initial data):
   ```bash
   npm run init-db
   ```

## 🔐 Environment Variables

Create a `.env` file in the `OurSocietyServer` directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maindb

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx

# UploadThing (Optional - for file uploads)
UPLOADTHING_SECRET=sk_live_xxxxxxxxxxxxxxxxxxxxx

# Logging
LOG_LEVEL=info
```

### Environment Variable Details

- **PORT**: Server port (default: 5000)
- **NODE_ENV**: Environment mode (`development`, `production`, or `test`)
- **MONGODB_URI**: MongoDB connection string (required)
- **CLERK_SECRET_KEY**: Clerk secret key for authentication (required)
- **UPLOADTHING_SECRET**: UploadThing API key (optional, only needed for file uploads)
- **LOG_LEVEL**: Logging level (`error`, `warn`, `info`, `debug`)

## 🚀 Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Health Check

Once the server is running, verify it's working:

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "OK",
  "timestamp": "2025-01-XX...",
  "database": "Connected",
  "uptime": 123.45
}
```

## 📁 Project Structure

```
OurSocietyServer/
├── app.js                 # Main application entry point
├── config/
│   └── database.js        # MongoDB connection configuration
├── middleware/
│   ├── auth.js            # Clerk authentication middleware
│   ├── adminAuth.js       # Admin authentication & authorization
│   ├── errorHandler.js    # Error handling & logging
│   ├── security.js        # Security middleware (helmet, rate limiting)
│   └── validation.js      # Joi validation schemas
├── models/
│   ├── schemas.js         # MongoDB schemas
│   └── services/          # Business logic services
│       ├── UserService.js
│       ├── SocietyService.js
│       ├── MaintenanceService.js
│       ├── ForumService.js
│       ├── ContactService.js
│       └── EventService.js
├── routes/
│   ├── users.js           # User management routes
│   ├── societies.js       # Society management routes
│   ├── maintenance.js    # Maintenance payment routes
│   ├── forum.js           # Forum/community routes
│   ├── contacts.js        # Contact management routes
│   ├── events.js          # Event routes (user-facing)
│   ├── uploadthing.js     # File upload routes
│   └── admin/             # Admin-only routes
│       ├── users.js
│       ├── maintenance.js
│       ├── events.js
│       └── society.js
├── scripts/               # Utility scripts for testing/initialization
└── logs/                  # Application logs
```

## 🔌 API Endpoints

### Base URL

- **Development**: `http://localhost:5000/api`
- **Production**: Your production domain + `/api`

### Main Endpoints

#### Authentication & Users

- `GET /api/users/profile` - Get current user profile
- `GET /api/users/society/members` - Get society members
- `POST /api/users/register` - Register new user

#### Societies

- `GET /api/societies` - List all societies
- `GET /api/societies/:id` - Get society details
- `POST /api/societies/register` - Register new society

#### Maintenance

- `GET /api/maintenance/calendar` - Get maintenance calendar
- `GET /api/maintenance/history` - Get payment history
- `GET /api/maintenance/summary` - Get maintenance summary
- `POST /api/maintenance/upload` - Upload payment screenshot (URL)
- `POST /api/maintenance/upload-file` - Upload payment screenshot (file)

#### Forum

- `GET /api/forum` - Get forum posts
- `POST /api/forum` - Create forum post
- `PUT /api/forum/:id` - Update forum post
- `DELETE /api/forum/:id` - Delete forum post

#### Contacts

- `GET /api/contacts` - Get all contacts
- `POST /api/contacts` - Create contact (admin only)
- `PUT /api/contacts/:id` - Update contact (admin only)
- `DELETE /api/contacts/:id` - Delete contact (admin only)

#### Events

- `GET /api/events` - Get all events
- `GET /api/events/upcoming` - Get upcoming events
- `GET /api/events/:id` - Get event details

#### Admin Routes

- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET /api/admin/users` - List all users
- `GET /api/admin/maintenance/records` - Get all maintenance records
- `POST /api/admin/maintenance/approve/:id` - Approve payment
- `POST /api/admin/maintenance/reject/:id` - Reject payment
- `GET /api/admin/events` - Get all events (admin)
- `POST /api/admin/events` - Create event (admin)
- `PUT /api/admin/events/:id` - Update event (admin)
- `DELETE /api/admin/events/:id` - Delete event (admin)

#### File Uploads

- `POST /api/uploadthing/upload` - Upload file to UploadThing

### Authentication

All protected routes require a Clerk authentication token in the Authorization header:

```
Authorization: Bearer <clerk_token>
```

## 🐛 Debugging

### Enable Debug Logging

Set `LOG_LEVEL=debug` in your `.env` file for verbose logging.

### View Logs

Logs are stored in the `logs/` directory:

- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

### Common Debugging Steps

1. **Check Database Connection:**

   ```bash
   npm run test-schemas
   ```

2. **Test Authentication:**

   ```bash
   npm run test-auth
   ```

3. **Test User Endpoints:**

   ```bash
   npm run test-user-endpoints
   ```

4. **Check Server Health:**

   ```bash
   curl http://localhost:5000/health
   ```

5. **View Real-time Logs:**
   - Development mode shows logs in the console
   - Check `logs/combined.log` for detailed logs

### Debugging Tips

- **CORS Issues**: Check the `corsOptions` in `app.js` and ensure your frontend URL is whitelisted
- **Database Errors**: Verify `MONGODB_URI` is correct and the database is accessible
- **Authentication Errors**: Ensure `CLERK_SECRET_KEY` is valid and matches your Clerk project
- **File Upload Issues**: Check `UPLOADTHING_SECRET` if using UploadThing, or verify `uploads/` directory permissions

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Specific Test Suites

```bash
# Integration tests
npm run test:integration

# Unit tests
npm run test:unit
```

### Manual Testing Scripts

```bash
# Test schemas
npm run test-schemas

# Test services
npm run test-services

# Test user endpoints
npm run test-user-endpoints

# Test forum endpoints
npm run test-forum-endpoints

# Test contact endpoints
npm run test-contact-endpoints

# Run all manual tests
npm run test:manual
```

## ❗ Common Issues

### Issue: "Database not connected"

**Solution**:

- Verify `MONGODB_URI` in `.env` is correct
- Check MongoDB Atlas network access (whitelist your IP)
- Ensure MongoDB credentials are valid

### Issue: "Clerk authentication failed"

**Solution**:

- Verify `CLERK_SECRET_KEY` is correct
- Check that the token is being sent in the `Authorization` header
- Ensure the Clerk user exists and is active

### Issue: "CORS error"

**Solution**:

- Add your frontend URL to the `corsOptions.origin` array in `app.js`
- Ensure credentials are enabled if needed
- Check that the frontend is sending the correct headers

### Issue: "File upload fails"

**Solution**:

- If using UploadThing, verify `UPLOADTHING_SECRET` is set
- Check file size limits (default: 4MB)
- Ensure `uploads/` directory exists and has write permissions
- Verify file type is allowed (images only)

### Issue: "Port already in use"

**Solution**:

- Change `PORT` in `.env` to a different port
- Or kill the process using port 5000:

  ```bash
  # Windows
  netstat -ano | findstr :5000
  taskkill /PID <PID> /F

  # Mac/Linux
  lsof -ti:5000 | xargs kill
  ```

### Issue: "Module not found"

**Solution**:

- Run `npm install` to ensure all dependencies are installed
- Delete `node_modules` and `package-lock.json`, then run `npm install` again

## 📝 Additional Notes

- The server uses **Express 5.x** with async/await patterns
- All routes use `asyncHandler` for error handling
- Database operations use MongoDB native driver (not Mongoose)
- Authentication is handled via Clerk middleware
- File uploads support both local storage and UploadThing
- WebSocket support is available for real-time features

## 🔗 Related Documentation

- [Clerk Documentation](https://clerk.com/docs)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [Express.js Documentation](https://expressjs.com/)
- [UploadThing Documentation](https://docs.uploadthing.com/)

---

**Need Help?** Check the logs in `logs/` directory or enable debug logging for more details.

