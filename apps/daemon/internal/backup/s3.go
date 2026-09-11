package backup

import (
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Storage stores backup files in an S3-compatible backend.
type S3Storage struct {
	client   *s3.Client
	bucket   string
}

// S3Config holds the configuration for an S3-compatible storage backend.
type S3Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	Region    string
}

// NewS3Storage creates a new S3 storage backend with the given configuration.
func NewS3Storage(cfg S3Config) (*S3Storage, error) {
	awsCfg := aws.Config{
		Region:      cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		EndpointResolverWithOptions: aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			if service == s3.ServiceID {
				return aws.Endpoint{
					URL:               cfg.Endpoint,
					HostnameImmutable: true,
				}, nil
			}
			return aws.Endpoint{}, &aws.EndpointNotFoundError{}
		}),
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &S3Storage{client: client, bucket: cfg.Bucket}, nil
}

// Store uploads the backup data from the reader to S3.
func (s *S3Storage) Store(reader io.Reader, key string) (int64, error) {
	_, err := s.client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key + ".tar.gz"),
		Body:   reader,
	})
	if err != nil {
		return 0, fmt.Errorf("s3 upload: %w", err)
	}
	// S3 doesn't return content length easily; return 0 and let caller stat
	return 0, nil
}

// Retrieve downloads the backup file from S3.
func (s *S3Storage) Retrieve(key string) (io.ReadCloser, error) {
	resp, err := s.client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key + ".tar.gz"),
	})
	if err != nil {
		return nil, fmt.Errorf("s3 download: %w", err)
	}
	return resp.Body, nil
}

// Delete removes the backup file from S3.
func (s *S3Storage) Delete(key string) error {
	_, err := s.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key + ".tar.gz"),
	})
	if err != nil {
		return fmt.Errorf("s3 delete: %w", err)
	}
	return nil
}

// TestConnection tests S3 connectivity by listing objects (limit 1).
func (s *S3Storage) TestConnection() error {
	_, err := s.client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:  aws.String(s.bucket),
		MaxKeys: aws.Int32(1),
	})
	if err != nil {
		return fmt.Errorf("s3 connection test: %w", err)
	}
	return nil
}
